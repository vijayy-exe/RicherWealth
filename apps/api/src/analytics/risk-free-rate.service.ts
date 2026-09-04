import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { MemoryCacheService } from "../stocks/memory-cache.service";

const DAY_TTL_S = 60 * 60 * 24;
const CACHE_KEY = "risk-free-rate:DGS3MO";
// Last-resort static fallback if FRED is unreachable and nothing cached —
// roughly the long-run average 3-month T-bill rate, clearly a fallback,
// never silently presented as live data (isLive: false on the response).
const FALLBACK_ANNUAL_RATE_PCT = 4.5;

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

export interface RiskFreeRate {
  annualRatePct: number; // e.g. 5.25 meaning 5.25% per year
  isLive: boolean;
  fetchedAt: string;
}

/**
 * Risk-free rate for Sharpe/Sortino/Treynor — the 3-Month Treasury Bill
 * secondary market rate (FRED series DGS3MO), the standard short-term
 * risk-free proxy for US-dollar-denominated portfolio analysis.
 *
 * FRED (Federal Reserve Economic Data) is free but requires a (free,
 * instant-signup) API key — FRED_API_KEY in .env. Same Redis-with-
 * in-memory-fallback caching pattern as CurrencyService (24h TTL: this
 * is a daily-published series, no reason to refetch more often).
 */
@Injectable()
export class RiskFreeRateService implements OnModuleInit {
  private readonly logger = new Logger(RiskFreeRateService.name);
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
        this.logger.log("✓ Redis connected — using Redis risk-free-rate cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache for risk-free rate.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  /** Current annual risk-free rate (3-month T-bill), 24h cached. */
  async getAnnualRate(): Promise<RiskFreeRate> {
    const cached = await this.cache.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as RiskFreeRate;

    const fetched = await this.fetchFromFred();
    const result: RiskFreeRate = fetched ?? {
      annualRatePct: FALLBACK_ANNUAL_RATE_PCT,
      isLive: false,
      fetchedAt: new Date().toISOString(),
    };
    await this.cache.set(CACHE_KEY, JSON.stringify(result), DAY_TTL_S);
    return result;
  }

  /**
   * Convert the annual rate into a per-period rate for a return series
   * with `periodsPerYear` periods (e.g. 252 daily, 12 monthly).
   * Simple division (not compound de-annualization) — the standard,
   * widely-used approximation for short-horizon risk-free adjustments in
   * Sharpe/Sortino/Treynor calculations.
   */
  async getPeriodRate(periodsPerYear: number): Promise<number> {
    const { annualRatePct } = await this.getAnnualRate();
    return annualRatePct / 100 / periodsPerYear;
  }

  private async fetchFromFred(): Promise<RiskFreeRate | null> {
    const apiKey = this.config.get<string>("FRED_API_KEY");
    if (!apiKey) {
      this.logger.warn("FRED_API_KEY not configured — using fallback risk-free rate");
      return null;
    }
    try {
      const url = "https://api.stlouisfed.org/fred/series/observations";
      const res = await axios.get<{ observations?: Array<{ date: string; value: string }> }>(url, {
        params: {
          series_id: "DGS3MO",
          api_key: apiKey,
          file_type: "json",
          sort_order: "desc",
          limit: 5, // a few, in case the most recent is a non-trading-day "."
        },
        timeout: 6000,
      });
      const observations = res.data.observations ?? [];
      const latestValid = observations.find((o) => o.value !== ".");
      if (!latestValid) return null;
      const annualRatePct = Number(latestValid.value);
      if (!Number.isFinite(annualRatePct)) return null;
      this.logger.log(`FRED DGS3MO ✓ ${latestValid.date}: ${annualRatePct}%`);
      return { annualRatePct, isLive: true, fetchedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.warn(`FRED fetch failed: ${String(err)}`);
      return null;
    }
  }
}
