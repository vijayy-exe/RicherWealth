import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "./memory-cache.service";
import axios from "axios";

export interface LivePrice {
  ticker: string;
  exchange: string;
  price: number;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  pe: number | null;
  eps: number | null;
  bvps: number | null;
  dividendYield: number | null;
  currency: string;
  provider: string;
  fetchedAt: string; // ISO string
  isStale: boolean;
}

/** Redis TTL constants (seconds) — exported so other market-data services
 * (e.g. market-intelligence's world-indices widget) share the exact same
 * cadence instead of inventing a competing refresh window. */
export const MARKET_HOURS_TTL = 60 * 15;   // 15 min during market hours
export const OFF_HOURS_TTL = 60 * 60 * 6;  // 6 hr off-hours
const SEARCH_CACHE_TTL = 60 * 60 * 24; // 24h for ticker search

export interface TickerSearchResult {
  /** The bare ticker used by price APIs, e.g. "RELIANCE" not "RELIANCE.BSE" */
  symbol: string;
  name: string;
  /** Normalised exchange code: NSE | BSE | NASDAQ | NYSE | LSE | HKEX | TSX | ASX */
  exchange: string;
  currency: string;
  type?: string | undefined;
}

function redisKey(ticker: string, exchange: string): string {
  return `price:${exchange.toUpperCase()}:${ticker.toUpperCase()}`;
}

export function isMarketHours(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 0 || day === 6) return false;
  return hour >= 9 && hour < 17;
}

export function cacheTTL(): number {
  return isMarketHours() ? MARKET_HOURS_TTL : OFF_HOURS_TTL;
}

/** Unified cache interface that works with Redis or in-memory fallback */
interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: "EX", ttl: number): Promise<void>;
}

// ─── Exchange normalisation helpers ───────────────────────────────────────────

/** Map AV region strings to our exchange codes */
const AV_REGION_TO_EXCHANGE: Record<string, string> = {
  "United States": "NASDAQ",
  "India/Bombay": "BSE",
  "India/NSE": "NSE",
  "India": "NSE",
  "United Kingdom": "LSE",
  "Toronto": "TSX",
  "Brazil/Sao Paolo": "NYSE",
  "China": "HKEX",
  "Hong Kong": "HKEX",
  "Australia": "ASX",
};

/**
 * Alpha Vantage returns symbols like "RELIANCE.BSE" for Indian stocks.
 * Split into { ticker: "RELIANCE", exchange: "BSE" } and detect exchange from suffix or region.
 */
function parseAvSymbol(avSymbol: string, region: string, currency: string): { ticker: string; exchange: string } {
  // Handle suffixed symbols like RELIANCE.BSE, INFY.NSE, AAPL.TRT
  const dotIdx = avSymbol.lastIndexOf(".");
  if (dotIdx > 0) {
    const suffix = avSymbol.slice(dotIdx + 1).toUpperCase();
    const ticker = avSymbol.slice(0, dotIdx);

    // Map known suffixes to our exchange codes
    const suffixMap: Record<string, string> = {
      BSE: "BSE",
      NSE: "NSE",
      BO: "BSE",
      NS: "NSE",
      TRT: "TSX",
      SAO: "NYSE",
      HK: "HKEX",
      AX: "ASX",
      L: "LSE",
    };

    if (suffixMap[suffix]) {
      return { ticker, exchange: suffixMap[suffix] };
    }
  }

  // No suffix — use region/currency mapping
  const exchange =
    AV_REGION_TO_EXCHANGE[region] ??
    (currency === "INR" ? "NSE" : currency === "GBP" ? "LSE" : currency === "HKD" ? "HKEX" : "NASDAQ");

  return { ticker: avSymbol, exchange };
}

/** Build the AV quote symbol from our ticker + exchange */
function toAvQuoteSymbol(ticker: string, exchange: string): string {
  // AV uses RELIANCE.BSE / INFY.NSE format for Indian stocks
  switch (exchange.toUpperCase()) {
    case "BSE": return `${ticker}.BSE`;
    case "NSE": return `${ticker}.NSE`;
    case "LSE": return `${ticker}.LON`;
    case "HKEX": return `${ticker}.HKG`;
    case "ASX": return `${ticker}.AX`;
    case "TSX": return `${ticker}.TRT`;
    default: return ticker; // US exchanges need no suffix
  }
}

/** Build the Yahoo Finance symbol from our ticker + exchange */
function toYahooSymbol(ticker: string, exchange: string): string {
  switch (exchange.toUpperCase()) {
    case "NSE":  return `${ticker}.NS`;
    case "BSE":  return `${ticker}.BO`;
    case "LSE":  return `${ticker}.L`;
    case "HKEX": return `${ticker}.HK`;
    case "ASX":  return `${ticker}.AX`;
    case "TSX":  return `${ticker}.TO`;
    default: return ticker; // NASDAQ/NYSE — no suffix needed
  }
}

/** Build the Finnhub symbol (exchange prefix only for some exchanges) */
function toFinnhubSymbol(ticker: string, exchange: string): string {
  switch (exchange.toUpperCase()) {
    case "NSE": return `NSE:${ticker}`;
    case "BSE": return `BSE:${ticker}`;
    case "LSE": return `LSE:${ticker}`;
    default: return ticker;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PriceSyncService implements OnModuleInit {
  private readonly logger = new Logger(PriceSyncService.name);

  private readonly avKey: string;
  private readonly finnhubKey: string;
  private readonly twelveKey: string;

  private cache!: CacheAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
  ) {
    this.avKey = this.config.get<string>("ALPHA_VANTAGE_KEY") ?? "demo";
    this.finnhubKey = this.config.get<string>("FINNHUB_KEY") ?? "";
    this.twelveKey = this.config.get<string>("TWELVE_DATA_KEY") ?? "";
  }

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    try {
      const { Redis } = await import("ioredis");
      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,    // no retries on any command
        retryStrategy: () => null,   // disable all reconnect attempts
        connectTimeout: 3000,
      });

      // Absorb all Redis error events to prevent uncaught-exception crash
      redis.on("error", () => { /* suppressed — we fall back to memory below */ });

      try {
        await redis.connect();
        await redis.ping();

        this.cache = {
          get: (key) => redis.get(key),
          set: (key, value, _ex, ttl) => redis.set(key, value, "EX", ttl).then(() => undefined),
        };
        this.logger.log("✓ Redis connected — using Redis price cache");
        return;
      } catch {
        // Connect failed — kill the instance so it stops retrying
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache (prices reset on restart).");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, _ex, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async getPrice(ticker: string, exchange: string): Promise<LivePrice | null> {
    const key = redisKey(ticker, exchange);
    const cached = await this.cache.get(key);

    if (cached) {
      const parsed = JSON.parse(cached) as LivePrice;
      const ageMs = Date.now() - new Date(parsed.fetchedAt).getTime();
      parsed.isStale = ageMs > MARKET_HOURS_TTL * 1000;
      return parsed;
    }

    return this.refreshPrice(ticker, exchange);
  }

  async refreshPrice(ticker: string, exchange: string): Promise<LivePrice | null> {
    let price: LivePrice | null = null;

    // Yahoo Finance first — free, no key, excellent NSE/BSE/US coverage
    price = await this.fetchYahoo(ticker, exchange);

    if (!price && this.twelveKey) {
      this.logger.warn(`Yahoo failed for ${ticker}:${exchange}, trying Twelve Data`);
      price = await this.fetchTwelveData(ticker, exchange);
    }

    if (!price) {
      this.logger.warn(`Twelve Data failed for ${ticker}:${exchange}, trying Alpha Vantage`);
      price = await this.fetchAlphaVantage(ticker, exchange);
    }

    if (!price && this.finnhubKey) {
      this.logger.warn(`AV failed for ${ticker}:${exchange}, trying Finnhub`);
      price = await this.fetchFinnhub(ticker, exchange);
    }

    if (!price) {
      this.logger.error(`All providers failed for ${ticker}:${exchange}`);
      return null;
    }

    const key = redisKey(ticker, exchange);
    await this.cache.set(key, JSON.stringify(price), "EX", cacheTTL());
    await this.upsertStockPrice(ticker, exchange, price);

    return { ...price, isStale: false };
  }

  async refreshAllActiveTickers(): Promise<void> {
    const holdings = await this.prisma.stockHolding.findMany({
      where: { asset: { deletedAt: null } },
      distinct: ["ticker", "exchange"],
      select: { ticker: true, exchange: true },
    });

    this.logger.log(`Refreshing prices for ${holdings.length} tickers`);

    for (const h of holdings) {
      await this.refreshPrice(h.ticker, h.exchange);
      await new Promise((r) => setTimeout(r, 12_000));
    }
  }

  /**
   * Ticker autocomplete — uses Twelve Data's symbol_search (better quality results
   * with correct exchange codes), falls back to Alpha Vantage SYMBOL_SEARCH.
   * Returns normalised { symbol, exchange } pairs ready to use directly.
   */
  async searchTickers(query: string): Promise<TickerSearchResult[]> {
    if (!query || query.length < 1) return [];

    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as TickerSearchResult[];

    // Try Twelve Data first (better exchange codes, handles Indian stocks properly)
    if (this.twelveKey) {
      const results = await this.searchTwelveData(query);
      if (results.length > 0) {
        await this.cache.set(cacheKey, JSON.stringify(results), "EX", SEARCH_CACHE_TTL);
        return results;
      }
    }

    // Fallback: Alpha Vantage SYMBOL_SEARCH
    const results = await this.searchAlphaVantage(query);
    await this.cache.set(cacheKey, JSON.stringify(results), "EX", SEARCH_CACHE_TTL);
    return results;
  }

  // ─── Provider Implementations ──────────────────────────────────────────────

  private async fetchYahoo(ticker: string, exchange: string): Promise<LivePrice | null> {
    try {
      const symbol = toYahooSymbol(ticker, exchange);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res = await axios.get<{
        chart: {
          result: Array<{
            meta: {
              regularMarketPrice: number;
              chartPreviousClose?: number;
              regularMarketDayHigh?: number;
              regularMarketDayLow?: number;
              regularMarketVolume?: number;
              currency?: string;
            };
          }> | null;
          error?: { code: string; description: string } | null;
        };
      }>(url, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RicherWealth/1.0)" },
      });

      const result = res.data?.chart?.result?.[0];
      if (!result || !result.meta?.regularMarketPrice) {
        this.logger.warn(`Yahoo: no price for ${symbol}`);
        return null;
      }

      const meta = result.meta;
      const price = meta.regularMarketPrice;
      const currency = meta.currency ?? (["NSE", "BSE"].includes(exchange.toUpperCase()) ? "INR" : "USD");

      this.logger.log(`Yahoo ✓ ${ticker}:${exchange} → ${price}`);

      return {
        ticker,
        exchange,
        price,
        previousClose: meta.chartPreviousClose ?? null,
        dayHigh: meta.regularMarketDayHigh ?? null,
        dayLow: meta.regularMarketDayLow ?? null,
        volume: meta.regularMarketVolume ?? null,
        pe: null,
        eps: null,
        bvps: null,
        dividendYield: null,
        currency,
        provider: "yahoo_finance",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`Yahoo Finance fetch failed for ${ticker}:${exchange}: ${String(err)}`);
      return null;
    }
  }

  private async fetchAlphaVantage(ticker: string, exchange: string): Promise<LivePrice | null> {
    try {
      const avTicker = toAvQuoteSymbol(ticker, exchange);
      const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${avTicker}&apikey=${this.avKey}`;
      const quoteRes = await axios.get<{ "Global Quote": Record<string, string> }>(quoteUrl, { timeout: 8000 });
      const q = quoteRes.data["Global Quote"];

      if (!q || !q["05. price"] || q["05. price"] === "0.0000") {
        this.logger.warn(`AV: empty/zero price for ${avTicker}`);
        return null;
      }

      // Fetch fundamentals (best-effort, non-blocking)
      let pe: number | null = null;
      let eps: number | null = null;
      let bvps: number | null = null;
      let dividendYield: number | null = null;

      try {
        const overviewUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${avTicker}&apikey=${this.avKey}`;
        const ovRes = await axios.get<Record<string, string>>(overviewUrl, { timeout: 5000 });
        const ov = ovRes.data;
        pe = parseFloatOrNull(ov["PERatio"]);
        eps = parseFloatOrNull(ov["EPS"]);
        bvps = parseFloatOrNull(ov["BookValue"]);
        dividendYield = parseFloatOrNull(ov["DividendYield"]);
      } catch { /* fundamentals optional */ }

      const currency = ["NSE", "BSE"].includes(exchange.toUpperCase()) ? "INR" : "USD";

      this.logger.log(`AV ✓ ${ticker}:${exchange} → ${q["05. price"]}`);

      return {
        ticker,
        exchange,
        price: parseFloat(q["05. price"]),
        previousClose: parseFloatOrNull(q["08. previous close"]),
        dayHigh: parseFloatOrNull(q["03. high"]),
        dayLow: parseFloatOrNull(q["04. low"]),
        volume: parseFloatOrNull(q["06. volume"]),
        pe,
        eps,
        bvps,
        dividendYield,
        currency,
        provider: "alpha_vantage",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`Alpha Vantage fetch failed for ${ticker}:${exchange}: ${String(err)}`);
      return null;
    }
  }

  private async fetchFinnhub(ticker: string, exchange: string): Promise<LivePrice | null> {
    try {
      const symbol = toFinnhubSymbol(ticker, exchange);
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.finnhubKey}`;
      const res = await axios.get<FinnhubQuote>(url, { timeout: 5000 });
      const d = res.data;

      if (!d.c || d.c === 0) {
        this.logger.warn(`Finnhub: zero price for ${symbol}`);
        return null;
      }

      this.logger.log(`Finnhub ✓ ${ticker}:${exchange} → ${d.c}`);

      return {
        ticker,
        exchange,
        price: d.c,
        previousClose: d.pc ?? null,
        dayHigh: d.h ?? null,
        dayLow: d.l ?? null,
        volume: null,
        pe: null,
        eps: null,
        bvps: null,
        dividendYield: null,
        currency: ["NSE", "BSE"].includes(exchange.toUpperCase()) ? "INR" : "USD",
        provider: "finnhub",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`Finnhub fetch failed for ${ticker}:${exchange}: ${String(err)}`);
      return null;
    }
  }

  private async fetchTwelveData(ticker: string, exchange: string): Promise<LivePrice | null> {
    try {
      // Twelve Data accepts exchange parameter directly
      const exchangeParam = ["NSE", "BSE"].includes(exchange.toUpperCase())
        ? `&exchange=${exchange.toUpperCase()}`
        : "";
      const url = `https://api.twelvedata.com/price?symbol=${ticker}${exchangeParam}&apikey=${this.twelveKey}`;
      const res = await axios.get<{ price?: string; code?: number; message?: string }>(url, { timeout: 5000 });

      if (!res.data.price || res.data.code) {
        this.logger.warn(`Twelve Data: no price for ${ticker}:${exchange} — ${res.data.message ?? "unknown error"}`);
        return null;
      }

      this.logger.log(`TwelveData ✓ ${ticker}:${exchange} → ${res.data.price}`);

      return {
        ticker,
        exchange,
        price: parseFloat(res.data.price),
        previousClose: null,
        dayHigh: null,
        dayLow: null,
        volume: null,
        pe: null,
        eps: null,
        bvps: null,
        dividendYield: null,
        currency: ["NSE", "BSE"].includes(exchange.toUpperCase()) ? "INR" : "USD",
        provider: "twelve_data",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`Twelve Data fetch failed for ${ticker}:${exchange}: ${String(err)}`);
      return null;
    }
  }

  // ─── Search Providers ──────────────────────────────────────────────────────

  private async searchTwelveData(query: string): Promise<TickerSearchResult[]> {
    try {
      const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${this.twelveKey}`;
      const res = await axios.get<{ data?: TwelveSearchMatch[]; status?: string }>(url, { timeout: 5000 });
      const matches = res.data.data ?? [];

      const KNOWN_EXCHANGES = new Set(["NSE", "BSE", "NASDAQ", "NYSE", "LSE", "HKEX", "TSX", "ASX"]);

      // Map exchange codes
      const normaliseExchange = (raw: string): string => {
        const r = raw.toUpperCase();
        if (r === "XNSE" || r === "NSE") return "NSE";
        if (r === "XBOM" || r === "BSE") return "BSE";
        if (r === "XNAS" || r === "NASDAQ") return "NASDAQ";
        if (r === "XNYS" || r === "NYSE") return "NYSE";
        if (r === "XLON" || r === "LSE") return "LSE";
        if (r === "XHKG" || r === "HKEX") return "HKEX";
        if (r === "XTSE" || r === "TSX") return "TSX";
        if (r === "XASX" || r === "ASX") return "ASX";
        return KNOWN_EXCHANGES.has(r) ? r : "NYSE";
      };

      // Build results — skip dotted symbols (AV-style suffixes like HDFCAMC.BL)
      // and prefer NSE over BSE when both appear for the same stock
      const seen = new Map<string, TickerSearchResult>();

      for (const m of matches) {
        const itype = m.instrument_type;
        if (itype !== "Common Stock" && itype !== "ETF") continue;
        if (m.symbol.includes(".")) continue; // Skip HDFCAMC.BL, AAPL.TRT etc.

        const exchange = normaliseExchange(m.exchange ?? "");
        const key = m.symbol; // deduplicate by ticker

        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, { symbol: m.symbol, name: m.instrument_name, exchange, currency: m.currency, type: itype });
        } else if (exchange === "NSE" && existing.exchange === "BSE") {
          // Prefer NSE over BSE for the same stock
          seen.set(key, { symbol: m.symbol, name: m.instrument_name, exchange, currency: m.currency, type: itype });
        }

        if (seen.size >= 10) break;
      }

      return Array.from(seen.values());
    } catch (err) {
      this.logger.warn(`Twelve Data search failed: ${String(err)}`);
      return [];

    }
  }

  private async searchAlphaVantage(query: string): Promise<TickerSearchResult[]> {
    try {
      const url = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${this.avKey}`;
      const res = await axios.get<{ bestMatches?: AlphaSearchMatch[] }>(url, { timeout: 5000 });
      const matches = res.data.bestMatches ?? [];

      return matches.slice(0, 10).map((m) => {
        const { ticker, exchange } = parseAvSymbol(m["1. symbol"], m["4. region"], m["8. currency"]);
        return {
          symbol: ticker,
          name: m["2. name"],
          exchange,
          currency: m["8. currency"],
          type: m["3. type"],
        };
      });
    } catch (err) {
      this.logger.warn(`Alpha Vantage search failed: ${String(err)}`);
      return [];
    }
  }

  // ─── DB persistence ────────────────────────────────────────────────────────

  private async upsertStockPrice(ticker: string, exchange: string, price: LivePrice): Promise<void> {
    await this.prisma.stockPrice.upsert({
      where: { ticker_exchange: { ticker, exchange } },
      create: {
        ticker,
        exchange,
        price: price.price.toString(),
        previousClose: price.previousClose?.toString() ?? null,
        dayHigh: price.dayHigh?.toString() ?? null,
        dayLow: price.dayLow?.toString() ?? null,
        volume: price.volume ? BigInt(Math.round(price.volume)) : null,
        pe: price.pe?.toString() ?? null,
        eps: price.eps?.toString() ?? null,
        bvps: price.bvps?.toString() ?? null,
        dividendYield: price.dividendYield?.toString() ?? null,
        currency: price.currency,
        provider: price.provider,
        fetchedAt: new Date(price.fetchedAt),
      },
      update: {
        price: price.price.toString(),
        previousClose: price.previousClose?.toString() ?? null,
        dayHigh: price.dayHigh?.toString() ?? null,
        dayLow: price.dayLow?.toString() ?? null,
        volume: price.volume ? BigInt(Math.round(price.volume)) : null,
        pe: price.pe?.toString() ?? null,
        eps: price.eps?.toString() ?? null,
        bvps: price.bvps?.toString() ?? null,
        dividendYield: price.dividendYield?.toString() ?? null,
        currency: price.currency,
        provider: price.provider,
        fetchedAt: new Date(price.fetchedAt),
      },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFloatOrNull(value: string | undefined | null): number | null {
  if (!value || value === "None" || value === "-" || value === "N/A") return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

interface AlphaSearchMatch {
  "1. symbol": string;
  "2. name": string;
  "3. type": string;
  "4. region": string;
  "8. currency": string;
}

interface TwelveSearchMatch {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code: string;
  instrument_type: string;
  country: string;
  currency: string;
}

interface FinnhubQuote {
  c: number;   // current
  h: number;   // high
  l: number;   // low
  o: number;   // open
  pc: number;  // previous close
}
