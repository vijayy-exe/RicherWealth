import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import Decimal from "decimal.js";
import axios from "axios";

/**
 * CurrencyService — converts monetary amounts between currencies.
 *
 * Phase 7 rewrite: was `ForexService` (Phase 2, DB-cache only, single
 * provider). This is the shared conversion path every money-aggregating
 * service (net worth, dashboard, currency-exposure widget) should call —
 * per the project convention, domain services store values in their native
 * currency and conversion happens at read-time here, never at write-time.
 *
 * Providers:
 *   1. Frankfurter.app (ECB-sourced, free, no key) — primary, as specified.
 *   2. open.er-api.com (free, no key) — fallback. The originally-specified
 *      fallback, exchangerate.host, now requires a paid API key for its
 *      /latest endpoint (confirmed live: returns "missing_access_key").
 *      open.er-api.com is what the pre-Phase-7 ForexService already used
 *      successfully, so it's a verified-working substitute, not a guess.
 *   3. Hardcoded static rates — last resort for total outage / offline dev.
 *
 * Caching: Redis (or in-memory fallback, same adapter pattern as
 * stocks/crypto price sync) with a 24h TTL — daily refresh, as specified.
 * The Postgres `forex_rates` table is kept as a secondary persistence layer
 * (survives restarts, unlike the in-memory fallback) and is checked after
 * the fast-path cache but before hitting the network.
 */
@Injectable()
export class CurrencyService implements OnModuleInit {
  private readonly logger = new Logger(CurrencyService.name);
  private cache!: CacheAdapter;

  // Hard-coded fallback rates relative to USD — last resort only.
  private static readonly FALLBACK_RATES: Record<string, number> = {
    USD: 1, INR: 83.5, EUR: 0.92, GBP: 0.79, SGD: 1.34, AED: 3.67,
    JPY: 149.5, CAD: 1.36, AUD: 1.53, CHF: 0.9, HKD: 7.82,
  };

  constructor(
    private readonly prisma: PrismaService,
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
        this.logger.log("✓ Redis connected — using Redis currency-rate cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache (rates reset on restart).");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  /** Convert `amount` from `fromCurrency` to `toCurrency`. */
  async convert(amount: Decimal, fromCurrency: string, toCurrency: string): Promise<Decimal> {
    if (fromCurrency === toCurrency) return amount;
    const rate = await this.getRate(fromCurrency, toCurrency);
    return amount.mul(rate);
  }

  /** Get the exchange rate from `from` to `to`, 24h cached. */
  async getRate(from: string, to: string): Promise<Decimal> {
    if (from === to) return new Decimal(1);

    const cacheKey = `fx:${from}:${to}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return new Decimal(cached);

    // Secondary persistence layer — a rate fetched by another process/restart
    // recently is still better than a network call or a static fallback.
    const dbCached = await this.prisma.forexRate.findUnique({
      where: { fromCode_toCode: { fromCode: from, toCode: to } },
    });
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (dbCached && dbCached.fetchedAt > oneDayAgo) {
      const rate = new Decimal(dbCached.rate.toString());
      await this.cache.set(cacheKey, rate.toString(), DAY_TTL_S);
      return rate;
    }

    const rate = await this.fetchRate(from, to);
    await this.cache.set(cacheKey, rate.toString(), DAY_TTL_S);
    await this.prisma.forexRate.upsert({
      where: { fromCode_toCode: { fromCode: from, toCode: to } },
      create: { fromCode: from, toCode: to, rate: rate.toString() },
      update: { rate: rate.toString(), fetchedAt: new Date() },
    });
    return rate;
  }

  private async fetchRate(from: string, to: string): Promise<Decimal> {
    const fromFrankfurter = await this.fetchFrankfurter(from, to);
    if (fromFrankfurter) return fromFrankfurter;

    this.logger.warn(`Frankfurter failed for ${from}→${to}, trying open.er-api.com`);
    const fromErApi = await this.fetchOpenErApi(from, to);
    if (fromErApi) return fromErApi;

    this.logger.warn(`open.er-api.com failed for ${from}→${to}, using hardcoded fallback`);
    return this.getFallbackRate(from, to);
  }

  private async fetchFrankfurter(from: string, to: string): Promise<Decimal | null> {
    try {
      // Frankfurter has no USD-base quirk (unlike some ECB-derived feeds) and
      // covers major + most minor currencies directly.
      const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await axios.get<{ rates?: Record<string, number> }>(url, { timeout: 6000 });
      const rate = res.data.rates?.[to];
      if (!rate) return null;
      this.logger.log(`Frankfurter ✓ ${from}→${to}: ${rate}`);
      return new Decimal(rate);
    } catch (err) {
      this.logger.warn(`Frankfurter fetch failed for ${from}→${to}: ${String(err)}`);
      return null;
    }
  }

  private async fetchOpenErApi(from: string, to: string): Promise<Decimal | null> {
    try {
      const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`;
      const res = await axios.get<{ result?: string; rates?: Record<string, number> }>(url, { timeout: 6000 });
      if (res.data.result !== "success") return null;
      const rate = res.data.rates?.[to];
      if (!rate) return null;
      this.logger.log(`open.er-api.com ✓ ${from}→${to}: ${rate}`);
      return new Decimal(rate);
    } catch (err) {
      this.logger.warn(`open.er-api.com fetch failed for ${from}→${to}: ${String(err)}`);
      return null;
    }
  }

  private getFallbackRate(from: string, to: string): Decimal {
    const fromUsd = CurrencyService.FALLBACK_RATES[from] ?? 1;
    const toUsd = CurrencyService.FALLBACK_RATES[to] ?? 1;
    const rate = toUsd / fromUsd;
    this.logger.warn(`Using hardcoded fallback rate ${from}→${to}: ${rate}`);
    return new Decimal(rate);
  }

  /** Convenience: get rate synchronously from the hardcoded table (for tests). */
  static getFallbackRateSync(from: string, to: string): Decimal {
    const fromUsd = CurrencyService.FALLBACK_RATES[from] ?? 1;
    const toUsd = CurrencyService.FALLBACK_RATES[to] ?? 1;
    return new Decimal(toUsd / fromUsd);
  }
}

const DAY_TTL_S = 60 * 60 * 24;

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}
