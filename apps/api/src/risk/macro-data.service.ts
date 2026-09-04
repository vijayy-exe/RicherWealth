import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { MemoryCacheService } from "../stocks/memory-cache.service";

const DAY_TTL_S = 60 * 60 * 24;
const CACHE_KEY = "macro-data:inflation:CPIAUCSL";
// Last-resort static fallback — a plausible recent-years US CPI YoY figure.
// Never presented as live data (isLive: false).
const FALLBACK_INFLATION_PCT = 3.5;

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

export interface InflationRate {
  yoyPct: number; // e.g. 3.2 meaning 3.2% year-over-year
  isLive: boolean;
  fetchedAt: string;
}

/**
 * Inflation input for Phase 12's inflation-risk sub-score: US CPI-U
 * (FRED series CPIAUCSL), requested with `units=pc1` so FRED itself returns
 * the year-over-year percent change — no manual differencing needed.
 * Reuses the exact Redis-with-in-memory-fallback caching pattern as
 * RiskFreeRateService (same FRED_API_KEY, same 24h TTL — this is a
 * monthly-published series, so refetching more often would be pointless).
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

    const fetched = await this.fetchFromFred();
    const result: InflationRate = fetched ?? {
      yoyPct: FALLBACK_INFLATION_PCT,
      isLive: false,
      fetchedAt: new Date().toISOString(),
    };
    await this.cache.set(CACHE_KEY, JSON.stringify(result), DAY_TTL_S);
    return result;
  }

  private async fetchFromFred(): Promise<InflationRate | null> {
    const apiKey = this.config.get<string>("FRED_API_KEY");
    if (!apiKey) {
      this.logger.warn("FRED_API_KEY not configured — using fallback inflation rate");
      return null;
    }
    try {
      const url = "https://api.stlouisfed.org/fred/series/observations";
      const res = await axios.get<{ observations?: Array<{ date: string; value: string }> }>(url, {
        params: {
          series_id: "CPIAUCSL",
          units: "pc1", // FRED computes % change from a year ago for us
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
      const yoyPct = Number(latestValid.value);
      if (!Number.isFinite(yoyPct)) return null;
      this.logger.log(`FRED CPIAUCSL (YoY) ✓ ${latestValid.date}: ${yoyPct}%`);
      return { yoyPct, isLive: true, fetchedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.warn(`FRED inflation fetch failed: ${String(err)}`);
      return null;
    }
  }
}
