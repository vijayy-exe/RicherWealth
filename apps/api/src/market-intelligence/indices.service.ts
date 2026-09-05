import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { cacheTTL } from "../stocks/price-sync.service";
import type { MarketQuote } from "@richer/shared-types";

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

/** Curated world-index list — Yahoo Finance chart symbols (the exact
 * technique already used by stocks/price-sync.service.ts's fetchYahoo,
 * free, no key). Kept small and deliberate rather than "every index" —
 * this is a widget, not an index database. */
const INDICES: Array<{ symbol: string; label: string }> = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow Jones" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^FTSE", label: "FTSE 100" },
  { symbol: "^N225", label: "Nikkei 225" },
  { symbol: "^BSESN", label: "BSE Sensex" },
  { symbol: "^NSEI", label: "Nifty 50" },
];

function indexKey(symbol: string): string {
  return `market-intel:index:${symbol}`;
}

/**
 * World-indices widget for Phase 14's Markets page. Deliberately reuses
 * Phase 4's exact provider (Yahoo Finance chart endpoint) and cache
 * cadence (`cacheTTL()` from price-sync.service.ts — 15 min market hours /
 * 6h off-hours) rather than inventing a separate refresh schedule for
 * essentially the same kind of data.
 */
@Injectable()
export class IndicesService implements OnModuleInit {
  private readonly logger = new Logger(IndicesService.name);
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
        this.logger.log("✓ Redis connected — using Redis market-intelligence indices cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache for world indices.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  /** All curated indices, cache-first (each entry independently cached/refreshed). */
  async getIndices(): Promise<MarketQuote[]> {
    const results = await Promise.all(INDICES.map((idx) => this.getOne(idx)));
    return results.filter((q): q is MarketQuote => q !== null);
  }

  private async getOne({ symbol, label }: { symbol: string; label: string }): Promise<MarketQuote | null> {
    const key = indexKey(symbol);
    const cached = await this.cache.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as MarketQuote;
      const ageMs = Date.now() - new Date(parsed.fetchedAt).getTime();
      parsed.isStale = ageMs > cacheTTL() * 1000;
      return parsed;
    }
    return this.fetchYahoo(symbol, label);
  }

  private async fetchYahoo(symbol: string, label: string): Promise<MarketQuote | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res = await axios.get<{
        chart: {
          result: Array<{
            meta: {
              regularMarketPrice: number;
              chartPreviousClose?: number;
              currency?: string;
            };
          }> | null;
        };
      }>(url, {
        timeout: 8000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RicherWealth/1.0)" },
      });

      const meta = res.data?.chart?.result?.[0]?.meta;
      if (!meta || !meta.regularMarketPrice) {
        this.logger.warn(`Yahoo: no price for index ${symbol}`);
        return null;
      }

      const previousClose = meta.chartPreviousClose ?? null;
      const price = meta.regularMarketPrice;
      const changePct = previousClose ? ((price - previousClose) / previousClose) * 100 : null;

      const quote: MarketQuote = {
        symbol,
        label,
        price,
        previousClose,
        changePct,
        currency: meta.currency ?? "USD",
        provider: "yahoo_finance",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };

      this.logger.log(`Yahoo ✓ index ${symbol} → ${price}`);
      await this.cache.set(indexKey(symbol), JSON.stringify(quote), cacheTTL());
      return quote;
    } catch (err) {
      this.logger.warn(`Yahoo fetch failed for index ${symbol}: ${String(err)}`);
      return null;
    }
  }
}
