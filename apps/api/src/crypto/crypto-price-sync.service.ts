import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import axios from "axios";

export interface LiveCryptoPrice {
  coinId: string;
  price: number;              // in `currency`
  currency: string;           // "USD" | "INR" (whatever was requested)
  change24hPct: number | null;
  provider: string;
  fetchedAt: string;          // ISO string
  isStale: boolean;
}

export interface CoinSearchResult {
  coinId: string;
  symbol: string;
  name: string;
}

/** Cache TTL — crypto trades 24/7 so this is much shorter than the stock TTLs. */
const PRICE_TTL_S = 60 * 3;          // 3 min
const SEARCH_CACHE_TTL_S = 60 * 60 * 24; // 24h

/** Map our own currency codes to CoinGecko's `vs_currency` values (lowercase). */
const CG_CURRENCY = (code: string) => code.toLowerCase();

function priceKey(coinId: string, currency: string): string {
  return `crypto:price:${coinId}:${currency.toUpperCase()}`;
}

/** Unified cache interface — identical shape to PriceSyncService's, so both
 * modules can share the same Redis/in-memory fallback behavior. */
interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: "EX", ttl: number): Promise<void>;
}

// Symbols Binance actually lists against USDT — used only for the no-key
// fallback path, not for holding creation (CoinGecko's id space is what's
// stored, e.g. "bitcoin", not "BTC").
const BINANCE_SYMBOL: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  solana: "SOLUSDT",
  cardano: "ADAUSDT",
  dogecoin: "DOGEUSDT",
  ripple: "XRPUSDT",
  polkadot: "DOTUSDT",
  litecoin: "LTCUSDT",
  chainlink: "LINKUSDT",
  "matic-network": "MATICUSDT",
  "binancecoin": "BNBUSDT",
  tron: "TRXUSDT",
  "avalanche-2": "AVAXUSDT",
};

@Injectable()
export class CryptoPriceSyncService implements OnModuleInit {
  private readonly logger = new Logger(CryptoPriceSyncService.name);
  private readonly coincapKey: string;
  private cache!: CacheAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
  ) {
    // CoinCap's free v2 API (api.coincap.io) is dead — confirmed via direct
    // DNS lookup (NXDOMAIN). Their v3 API (rest.coincap.io) requires a key
    // (confirmed: 401 Unauthorized with no key). Support is wired in here,
    // gated behind an optional key exactly like FINNHUB_KEY/TWELVE_DATA_KEY
    // in the stocks module, so it activates automatically if a key is ever
    // added — but it is NOT relied on as the only fallback (see fetchBinance).
    this.coincapKey = this.config.get<string>("COINCAP_API_KEY") ?? "";
  }

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    try {
      const { Redis } = await import("ioredis");
      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        connectTimeout: 3000,
      });
      redis.on("error", () => { /* suppressed — falls back to memory below */ });

      try {
        await redis.connect();
        await redis.ping();
        this.cache = {
          get: (key) => redis.get(key),
          set: (key, value, _ex, ttl) => redis.set(key, value, "EX", ttl).then(() => undefined),
        };
        this.logger.log("✓ Redis connected — using Redis crypto price cache");
        return;
      } catch {
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

  async getPrice(coinId: string, currency: string): Promise<LiveCryptoPrice | null> {
    const key = priceKey(coinId, currency);
    const cached = await this.cache.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as LiveCryptoPrice;
      const ageMs = Date.now() - new Date(parsed.fetchedAt).getTime();
      parsed.isStale = ageMs > PRICE_TTL_S * 1000;
      return parsed;
    }
    return this.refreshPrice(coinId, currency);
  }

  /** Fetch fresh prices for many coins at once (used by the scheduler — one
   * CoinGecko request for N coins instead of N requests, respects the free
   * tier's 10-30 calls/min limit much better). */
  async refreshPrices(coinIds: string[], currencies: string[]): Promise<Map<string, LiveCryptoPrice>> {
    const results = new Map<string, LiveCryptoPrice>();
    if (coinIds.length === 0) return results;

    const fromCoinGecko = await this.fetchCoinGeckoBulk(coinIds, currencies);
    for (const [k, v] of fromCoinGecko) results.set(k, v);

    // Whatever CoinGecko didn't return, retry individually through the
    // fallback chain (CoinCap if keyed, else Binance).
    for (const coinId of coinIds) {
      for (const currency of currencies) {
        const k = priceKey(coinId, currency);
        if (results.has(k)) continue;
        const price = await this.fetchFallback(coinId, currency);
        if (price) results.set(k, price);
      }
    }

    for (const price of results.values()) {
      await this.cache.set(priceKey(price.coinId, price.currency), JSON.stringify(price), "EX", PRICE_TTL_S);
      await this.upsertCryptoPrice(price);
    }

    return results;
  }

  async refreshPrice(coinId: string, currency: string): Promise<LiveCryptoPrice | null> {
    const bulk = await this.fetchCoinGeckoBulk([coinId], [currency]);
    let price = bulk.get(priceKey(coinId, currency)) ?? null;

    if (!price) {
      this.logger.warn(`CoinGecko failed for ${coinId}:${currency}, trying fallback`);
      price = await this.fetchFallback(coinId, currency);
    }

    if (!price) {
      this.logger.error(`All providers failed for ${coinId}:${currency}`);
      return null;
    }

    await this.cache.set(priceKey(coinId, currency), JSON.stringify(price), "EX", PRICE_TTL_S);
    await this.upsertCryptoPrice(price);
    return { ...price, isStale: false };
  }

  async refreshAllActiveHoldings(): Promise<void> {
    const holdings = await this.prisma.cryptoHolding.findMany({
      where: { asset: { deletedAt: null } },
      distinct: ["coinId"],
      select: { coinId: true },
    });
    const currencies = ["USD", "INR"]; // the two currencies used across this app so far
    const coinIds = holdings.map((h) => h.coinId);
    this.logger.log(`Refreshing prices for ${coinIds.length} coins`);
    await this.refreshPrices(coinIds, currencies);
  }

  async searchCoins(query: string): Promise<CoinSearchResult[]> {
    if (!query || query.trim().length < 1) return [];
    const cacheKey = `crypto:search:${query.toLowerCase()}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as CoinSearchResult[];

    try {
      const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query.trim())}`;
      const res = await axios.get<{ coins: Array<{ id: string; symbol: string; name: string }> }>(url, { timeout: 8000 });
      const results = (res.data.coins ?? []).slice(0, 15).map((c) => ({
        coinId: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
      }));
      await this.cache.set(cacheKey, JSON.stringify(results), "EX", SEARCH_CACHE_TTL_S);
      return results;
    } catch (err) {
      this.logger.warn(`CoinGecko search failed: ${String(err)}`);
      return [];
    }
  }

  // ─── Provider implementations ───────────────────────────────────────────────

  /** Fetches many coins × many currencies in a single request. Returns a Map
   * keyed by priceKey(coinId, currency) for whichever pairs it got data for. */
  async fetchCoinGeckoBulk(coinIds: string[], currencies: string[]): Promise<Map<string, LiveCryptoPrice>> {
    const results = new Map<string, LiveCryptoPrice>();
    if (coinIds.length === 0) return results;
    try {
      const ids = coinIds.join(",");
      const vs = currencies.map(CG_CURRENCY).join(",");
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true&include_last_updated_at=true`;
      const res = await axios.get<Record<string, Record<string, number>>>(url, { timeout: 8000 });

      for (const coinId of coinIds) {
        const row = res.data[coinId];
        if (!row) continue;
        for (const currency of currencies) {
          const cgCurrency = CG_CURRENCY(currency);
          const price = row[cgCurrency];
          if (price === undefined) continue;
          const fetchedAt = new Date().toISOString();
          results.set(priceKey(coinId, currency), {
            coinId,
            price,
            currency: currency.toUpperCase(),
            change24hPct: row[`${cgCurrency}_24h_change`] ?? null,
            provider: "coingecko",
            fetchedAt,
            isStale: false,
          });
        }
      }
      if (results.size > 0) {
        this.logger.log(`CoinGecko ✓ ${results.size}/${coinIds.length * currencies.length} coin×currency pairs`);
      }
    } catch (err) {
      this.logger.warn(`CoinGecko bulk fetch failed: ${String(err)}`);
    }
    return results;
  }

  /** CoinCap (if keyed) → Binance (no key, USD-pair coverage only). */
  private async fetchFallback(coinId: string, currency: string): Promise<LiveCryptoPrice | null> {
    if (this.coincapKey) {
      const price = await this.fetchCoinCap(coinId, currency);
      if (price) return price;
    }
    return this.fetchBinance(coinId, currency);
  }

  private async fetchCoinCap(coinId: string, currency: string): Promise<LiveCryptoPrice | null> {
    try {
      const url = `https://rest.coincap.io/v3/assets/${encodeURIComponent(coinId)}`;
      const res = await axios.get<{ data: { priceUsd: string; changePercent24Hr: string } }>(url, {
        timeout: 8000,
        headers: { Authorization: `Bearer ${this.coincapKey}` },
      });
      const priceUsd = parseFloat(res.data.data.priceUsd);
      if (!priceUsd) return null;

      // CoinCap only quotes USD — convert if a different currency was asked for.
      // (Left as USD-only for now; forex conversion happens at the net-worth
      // aggregation layer for the Asset row regardless.)
      if (currency.toUpperCase() !== "USD") return null;

      this.logger.log(`CoinCap ✓ ${coinId} → ${priceUsd}`);
      return {
        coinId,
        price: priceUsd,
        currency: "USD",
        change24hPct: parseFloat(res.data.data.changePercent24Hr) || null,
        provider: "coincap",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`CoinCap fetch failed for ${coinId}: ${String(err)}`);
      return null;
    }
  }

  private async fetchBinance(coinId: string, currency: string): Promise<LiveCryptoPrice | null> {
    if (currency.toUpperCase() !== "USD") return null; // Binance USDT pairs only, treated as USD
    const symbol = BINANCE_SYMBOL[coinId];
    if (!symbol) return null;

    try {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
      const res = await axios.get<{ lastPrice: string; priceChangePercent: string }>(url, { timeout: 8000 });
      const price = parseFloat(res.data.lastPrice);
      if (!price) return null;

      this.logger.log(`Binance ✓ ${coinId} (${symbol}) → ${price}`);
      return {
        coinId,
        price,
        currency: "USD",
        change24hPct: parseFloat(res.data.priceChangePercent) || null,
        provider: "binance",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`Binance fetch failed for ${coinId}: ${String(err)}`);
      return null;
    }
  }

  // ─── DB persistence ────────────────────────────────────────────────────────

  private async upsertCryptoPrice(price: LiveCryptoPrice): Promise<void> {
    await this.prisma.cryptoHolding.updateMany({
      where: { coinId: price.coinId },
      data: { lastSyncAt: new Date(price.fetchedAt) },
    });
  }
}
