import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { MemoryCacheService } from "../stocks/memory-cache.service";

const DAY_TTL_S = 60 * 60 * 24;
const CACHE_KEY = "macro-data:inflation:CPIAUCSL";
const FEDFUNDS_CACHE_KEY = "macro-data:fedfunds:FEDFUNDS";
const GDP_CACHE_KEY = "macro-data:gdp:A191RL1Q225SBEA";
// Last-resort static fallbacks — plausible recent-years figures. Never
// presented as live data (isLive: false on every fallback response).
const FALLBACK_INFLATION_PCT = 3.5;
const FALLBACK_FEDFUNDS_PCT = 5.0;
const FALLBACK_GDP_GROWTH_PCT = 2.5;

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

export interface InflationRate {
  yoyPct: number; // e.g. 3.2 meaning 3.2% year-over-year
  isLive: boolean;
  fetchedAt: string;
}

export interface FedFundsRate {
  ratePct: number; // effective federal funds rate, e.g. 5.33
  isLive: boolean;
  fetchedAt: string;
}

export interface GdpGrowthRate {
  growthPct: number; // real GDP growth, annualized quarter-over-quarter, e.g. 2.8
  isLive: boolean;
  fetchedAt: string;
}

/**
 * Macro/economic-indicator data for Phase 12's inflation-risk sub-score AND
 * Phase 14's economic-calendar widget — both consume this one service so
 * there is exactly one FRED-backed source of truth for each series (no
 * competing fetch/cache for the same number). Three US series today:
 *   - CPIAUCSL (Consumer Price Index, `units=pc1` so FRED itself returns
 *     the YoY percent change — no manual differencing needed) — inflation.
 *   - FEDFUNDS (Effective Federal Funds Rate, monthly) — the Fed rate shown
 *     on the economic calendar.
 *   - A191RL1Q225SBEA (Real GDP, percent change from preceding period,
 *     annualized) — already the "GDP growth rate" figure, not the raw
 *     $-trillions GDP level, since that's what an economic calendar means
 *     by "GDP".
 * Reuses the exact Redis-with-in-memory-fallback caching pattern as
 * RiskFreeRateService (same FRED_API_KEY, same 24h TTL — these are
 * monthly/quarterly-published series, so refetching more often would be
 * pointless).
 */
@Injectable()
export class MacroDataService implements OnModuleInit {
  private readonly logger = new Logger(MacroDataService.name);
  private cache!: CacheAdapter;

  constructor(
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    try {
      const { Redis } = await import("ioredis");
      const redis = new Redis(redisUrl, {
        lazyConnect: true, enableOfflineQueue: false,
        maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 3000,
      });
      redis.on("error", () => { /* suppressed — falls back to memory below */ });
      try {
        await redis.connect();
        await redis.ping();
        this.cache = {
          get: (key) => redis.get(key),
          set: (key, value, ttl) => redis.set(key, value, "EX", ttl).then(() => undefined),
        };
        this.logger.log("✓ Redis connected — using Redis macro-data cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache for macro data.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  /** Current YoY CPI inflation rate, 24h cached. */
  async getInflationRate(): Promise<InflationRate> {
    const cached = await this.cache.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as InflationRate;

    const value = await this.fetchSeriesLatest("CPIAUCSL", "pc1");
    const result: InflationRate = value !== null
      ? { yoyPct: value, isLive: true, fetchedAt: new Date().toISOString() }
      : { yoyPct: FALLBACK_INFLATION_PCT, isLive: false, fetchedAt: new Date().toISOString() };
    await this.cache.set(CACHE_KEY, JSON.stringify(result), DAY_TTL_S);
    return result;
  }

  /** Effective Federal Funds Rate, 24h cached. Used by Phase 14's economic calendar. */
  async getFedFundsRate(): Promise<FedFundsRate> {
    const cached = await this.cache.get(FEDFUNDS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as FedFundsRate;

    const value = await this.fetchSeriesLatest("FEDFUNDS");
    const result: FedFundsRate = value !== null
      ? { ratePct: value, isLive: true, fetchedAt: new Date().toISOString() }
      : { ratePct: FALLBACK_FEDFUNDS_PCT, isLive: false, fetchedAt: new Date().toISOString() };
    await this.cache.set(FEDFUNDS_CACHE_KEY, JSON.stringify(result), DAY_TTL_S);
    return result;
  }

  /** Real GDP growth (annualized QoQ %), 24h cached. Used by Phase 14's economic calendar. */
  async getGdpGrowthRate(): Promise<GdpGrowthRate> {
    const cached = await this.cache.get(GDP_CACHE_KEY);
    if (cached) return JSON.parse(cached) as GdpGrowthRate;

    const value = await this.fetchSeriesLatest("A191RL1Q225SBEA");
    const result: GdpGrowthRate = value !== null
      ? { growthPct: value, isLive: true, fetchedAt: new Date().toISOString() }
      : { growthPct: FALLBACK_GDP_GROWTH_PCT, isLive: false, fetchedAt: new Date().toISOString() };
    await this.cache.set(GDP_CACHE_KEY, JSON.stringify(result), DAY_TTL_S);
    return result;
  }

  /** Shared FRED fetch: latest non-"." observation for a series, optionally
   * transformed by FRED itself via `units` (e.g. "pc1" = % change from a
   * year ago). Returns null (never a fabricated number) on any failure. */
  private async fetchSeriesLatest(seriesId: string, units?: string): Promise<number | null> {
    const apiKey = this.config.get<string>("FRED_API_KEY");
    if (!apiKey) {
      this.logger.warn(`FRED_API_KEY not configured — using fallback for ${seriesId}`);
      return null;
    }
    try {
      const url = "https://api.stlouisfed.org/fred/series/observations";
      const res = await axios.get<{ observations?: Array<{ date: string; value: string }> }>(url, {
        params: {
          series_id: seriesId,
          ...(units ? { units } : {}),
          api_key: apiKey,
          file_type: "json",
          sort_order: "desc",
          limit: 3,
        },
        timeout: 6000,
      });
      const observations = res.data.observations ?? [];
      const latestValid = observations.find((o) => o.value !== ".");
      if (!latestValid) return null;
      const value = Number(latestValid.value);
      if (!Number.isFinite(value)) return null;
      this.logger.log(`FRED ${seriesId} ✓ ${latestValid.date}: ${value}`);
      return value;
    } catch (err) {
      this.logger.warn(`FRED ${seriesId} fetch failed: ${String(err)}`);
      return null;
    }
  }
}
