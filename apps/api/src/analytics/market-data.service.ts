import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";

const DAY_S = 60 * 60 * 24;
const METADATA_TTL_S = DAY_S * 7; // sector/geography/market-cap change rarely
const HISTORY_TTL_S = DAY_S; // yesterday's daily bar doesn't change; today's does

export type MarketCapBucket = "LARGE" | "MID" | "SMALL" | "N/A";

export interface HoldingMetadata {
  sector: string;
  geography: string;
  marketCap: MarketCapBucket;
}

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

/**
 * Fetches the data the quant engine needs but Postgres doesn't store:
 * (1) classification metadata for the allocation breakdown's sector/
 *     geography/market-cap dimensions, and (2) historical daily return
 *     series for beta/Sharpe/Sortino/correlation/Monte-Carlo calibration.
 *
 * Coverage is real but intentionally scoped, not faked, for asset types
 * with no natural free daily-price source:
 *   - STOCK/ETF: Alpha Vantage OVERVIEW (sector/country/market-cap) +
 *     TIME_SERIES_DAILY (returns) — the same provider/key already used
 *     by PriceSyncService.
 *   - CRYPTO: CoinGecko (free, no key) for both market-cap classification
 *     and daily price history.
 *   - MUTUAL_FUND: the NavHistory table already populated by the mutual
 *     funds module (MFAPI.in) — a real historical series, just read
 *     locally instead of fetched.
 *   - BOND/COMMODITY/PRECIOUS_METAL/REAL_ESTATE/OTHER: no free, liquid
 *     daily series exists for these generally (a bond's fair value, a
 *     specific property's price) — these get an honest sector-derived
 *     label instead of a market-cap bucket, geography "UNKNOWN" unless
 *     the caller supplies it, and are given a return series from
 *     AssetRevaluation history when the user has logged at least a few
 *     revaluations, otherwise excluded from correlation/beta (never
 *     backfilled with invented numbers).
 */
@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataService.name);
  private cache!: CacheAdapter;
  private readonly avKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
  ) {
    this.avKey = this.config.get<string>("ALPHA_VANTAGE_KEY") ?? "demo";
  }

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    try {
      const { Redis } = await import("ioredis");
      const redis = new Redis(redisUrl, {
        lazyConnect: true, enableOfflineQueue: false,
        maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 3000,
      });
      redis.on("error", () => {});
      try {
        await redis.connect();
        await redis.ping();
        this.cache = {
          get: (key) => redis.get(key),
          set: (key, value, ttl) => redis.set(key, value, "EX", ttl).then(() => undefined),
        };
        this.logger.log("✓ Redis connected — using Redis market-data cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }
    this.logger.warn("Redis unavailable — falling back to in-memory cache for market data.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  // ─── Classification metadata (sector / geography / market cap) ──────────

  async getStockMetadata(ticker: string, exchange: string): Promise<HoldingMetadata> {
    const cacheKey = `mkt:meta:stock:${ticker}:${exchange}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as HoldingMetadata;

    let result: HoldingMetadata = { sector: "UNKNOWN", geography: "UNKNOWN", marketCap: "N/A" };
    try {
      const avTicker = ["NSE", "BSE"].includes(exchange.toUpperCase()) ? `${ticker}.${exchange === "NSE" ? "NS" : "BO"}` : ticker;
      const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${avTicker}&apikey=${this.avKey}`;
      const res = await axios.get<Record<string, string>>(url, { timeout: 5000 });
      const ov = res.data;
      const marketCapUsd = Number(ov["MarketCapitalization"]);
      result = {
        sector: ov["Sector"] || "UNKNOWN",
        geography: ov["Country"] || "UNKNOWN",
        marketCap: bucketStockMarketCap(marketCapUsd),
      };
    } catch (err) {
      this.logger.warn(`Metadata fetch failed for ${ticker}:${exchange}: ${String(err)}`);
    }
    await this.cache.set(cacheKey, JSON.stringify(result), METADATA_TTL_S);
    return result;
  }

  async getCryptoMetadata(coinId: string): Promise<HoldingMetadata> {
    const cacheKey = `mkt:meta:crypto:${coinId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as HoldingMetadata;

    let result: HoldingMetadata = { sector: "Cryptocurrency", geography: "Global", marketCap: "N/A" };
    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets`;
      const res = await axios.get<Array<{ market_cap: number }>>(url, {
        params: { vs_currency: "usd", ids: coinId },
        timeout: 5000,
      });
      const marketCapUsd = res.data[0]?.market_cap;
      result = { sector: "Cryptocurrency", geography: "Global", marketCap: bucketCryptoMarketCap(marketCapUsd) };
    } catch (err) {
      this.logger.warn(`CoinGecko metadata fetch failed for ${coinId}: ${String(err)}`);
    }
    await this.cache.set(cacheKey, JSON.stringify(result), METADATA_TTL_S);
    return result;
  }

  /** Non-fetched classification for asset types with no live market-cap concept. */
  staticMetadata(assetType: string): HoldingMetadata {
    const sectorByType: Record<string, string> = {
      MUTUAL_FUND: "Diversified Fund",
      BOND: "Fixed Income",
      COMMODITY: "Commodities",
      GOLD: "Precious Metals",
      SILVER: "Precious Metals",
      REAL_ESTATE: "Real Estate",
    };
    return { sector: sectorByType[assetType] ?? "Other", geography: "UNKNOWN", marketCap: "N/A" };
  }

  // ─── Historical daily return series ──────────────────────────────────────

  /** Returns [{date: "YYYY-MM-DD", return: number}] — daily % change,
   * or null if no real history is available for this holding. */
  async getStockReturns(ticker: string, exchange: string): Promise<DailyReturn[] | null> {
    const cacheKey = `mkt:hist:stock:${ticker}:${exchange}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as DailyReturn[];

    try {
      const avTicker = ["NSE", "BSE"].includes(exchange.toUpperCase()) ? `${ticker}.${exchange === "NSE" ? "NS" : "BO"}` : ticker;
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${avTicker}&outputsize=full&apikey=${this.avKey}`;
      const res = await axios.get<{ "Time Series (Daily)"?: Record<string, { "4. close": string }> }>(url, { timeout: 10000 });
      const series = res.data["Time Series (Daily)"];
      if (!series) return null;
      const returns = closesToReturns(
        Object.entries(series)
          .map(([date, bar]) => ({ date, close: Number(bar["4. close"]) }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-380), // ~1.5 trading years of daily bars, plenty for annualized stats
      );
      await this.cache.set(cacheKey, JSON.stringify(returns), HISTORY_TTL_S);
      return returns;
    } catch (err) {
      this.logger.warn(`Historical price fetch failed for ${ticker}:${exchange}: ${String(err)}`);
      return null;
    }
  }

  async getCryptoReturns(coinId: string): Promise<DailyReturn[] | null> {
    const cacheKey = `mkt:hist:crypto:${coinId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as DailyReturn[];

    try {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`;
      const res = await axios.get<{ prices: [number, number][] }>(url, {
        params: { vs_currency: "usd", days: 365, interval: "daily" },
        timeout: 10000,
      });
      const bars = res.data.prices.map(([ts, price]) => ({
        date: new Date(ts).toISOString().slice(0, 10),
        close: price,
      }));
      const returns = closesToReturns(bars);
      await this.cache.set(cacheKey, JSON.stringify(returns), HISTORY_TTL_S);
      return returns;
    } catch (err) {
      this.logger.warn(`CoinGecko history fetch failed for ${coinId}: ${String(err)}`);
      return null;
    }
  }

  async getMutualFundReturns(schemeCode: string): Promise<DailyReturn[] | null> {
    const history = await this.prisma.navHistory.findMany({
      where: { schemeCode },
      orderBy: { date: "asc" },
      take: 380,
    });
    if (history.length < 10) return null;
    const bars = history.map((h) => ({ date: h.date.toISOString().slice(0, 10), close: Number(h.nav.toString()) }));
    return closesToReturns(bars);
  }

  /** Generic fallback for asset types with no market-data source: derive
   * a (typically sparse) return series from the user's own manual
   * revaluation log. Returns null if there aren't enough points to be
   * meaningful (fewer than 4 revaluations -> fewer than 3 returns). */
  async getRevaluationReturns(assetId: string): Promise<DailyReturn[] | null> {
    const revaluations = await this.prisma.assetRevaluation.findMany({
      where: { assetId },
      orderBy: { valuedAt: "asc" },
    });
    if (revaluations.length < 4) return null;
    const bars = revaluations.map((r) => ({ date: r.valuedAt.toISOString().slice(0, 10), close: Number(r.value.toString()) }));
    return closesToReturns(bars);
  }
}

export interface DailyReturn {
  date: string;
  return: number;
}

function closesToReturns(bars: Array<{ date: string; close: number }>): DailyReturn[] {
  const out: DailyReturn[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!.close;
    const cur = bars[i]!.close;
    if (prev > 0) out.push({ date: bars[i]!.date, return: (cur - prev) / prev });
  }
  return out;
}

function bucketStockMarketCap(marketCapUsd: number | undefined): MarketCapBucket {
  if (!marketCapUsd || !Number.isFinite(marketCapUsd)) return "N/A";
  if (marketCapUsd >= 10_000_000_000) return "LARGE";
  if (marketCapUsd >= 2_000_000_000) return "MID";
  return "SMALL";
}

function bucketCryptoMarketCap(marketCapUsd: number | undefined): MarketCapBucket {
  // Crypto-specific thresholds — the space is smaller in aggregate than
  // equities, so equity thresholds would bucket almost everything SMALL.
  if (!marketCapUsd || !Number.isFinite(marketCapUsd)) return "N/A";
  if (marketCapUsd >= 10_000_000_000) return "LARGE";
  if (marketCapUsd >= 1_000_000_000) return "MID";
  return "SMALL";
}
