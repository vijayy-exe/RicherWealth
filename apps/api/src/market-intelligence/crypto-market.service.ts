import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import type { MarketQuote } from "@richer/shared-types";

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

/** Same 3-minute TTL as Phase 6's crypto-price-sync.service.ts — crypto
 * trades 24/7 so a shorter cache window than stocks/indices is warranted,
 * but this widget must not poll CoinGecko on its own faster cadence than
 * that established precedent. */
const TTL_S = 60 * 3;
const TOP_KEY = "market-intel:crypto:top10";
const GAINERS_KEY = "market-intel:crypto:gainers";
const LOSERS_KEY = "market-intel:crypto:losers";

interface CoinGeckoMarketEntry {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
}

function toQuote(c: CoinGeckoMarketEntry): MarketQuote {
  const changePct = c.price_change_percentage_24h;
  const previousClose = changePct !== null && changePct !== -100
    ? c.current_price / (1 + changePct / 100)
    : null;
  return {
    symbol: c.symbol.toUpperCase(),
    label: c.name,
    price: c.current_price,
    previousClose,
    changePct,
    currency: "USD",
    provider: "coingecko",
    fetchedAt: new Date().toISOString(),
    isStale: false,
  };
}

/**
 * Crypto market widget (top coins by market cap + 24h gainers/losers) for
 * Phase 14's Markets page. Reuses CoinGecko exactly as Phase 6's
 * crypto-price-sync.service.ts does (free, no key) — `/coins/markets`
 * natively supports `order=price_change_percentage_24h_desc/asc`, so
 * gainers/losers are a single request each, not a separate computation
 * over the whole market.
 */
@Injectable()
export class CryptoMarketService implements OnModuleInit {
  private readonly logger = new Logger(CryptoMarketService.name);
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
        this.logger.log("✓ Redis connected — using Redis market-intelligence crypto cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache for crypto market widget.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  async getTopCoins(): Promise<MarketQuote[]> {
    return this.getOrFetch(TOP_KEY, () => this.fetchMarkets("market_cap_desc"));
  }

  async getGainers(): Promise<MarketQuote[]> {
    return this.getOrFetch(GAINERS_KEY, () => this.fetchMarkets("price_change_percentage_24h_desc"));
  }

  async getLosers(): Promise<MarketQuote[]> {
    return this.getOrFetch(LOSERS_KEY, () => this.fetchMarkets("price_change_percentage_24h_asc"));
  }

  private async getOrFetch(key: string, fetcher: () => Promise<MarketQuote[]>): Promise<MarketQuote[]> {
    const cached = await this.cache.get(key);
    if (cached) return JSON.parse(cached) as MarketQuote[];
    const fresh = await fetcher();
    if (fresh.length > 0) await this.cache.set(key, JSON.stringify(fresh), TTL_S);
    return fresh;
  }

  private async fetchMarkets(order: string): Promise<MarketQuote[]> {
    try {
      const apiKey = this.config.get<string>("COINGECKO_API_KEY");
      const url = "https://api.coingecko.com/api/v3/coins/markets";
      const res = await axios.get<CoinGeckoMarketEntry[]>(url, {
        params: {
          vs_currency: "usd",
          order,
          per_page: 10,
          page: 1,
          price_change_percentage: "24h",
          ...(apiKey ? { x_cg_demo_api_key: apiKey } : {}),
        },
        timeout: 8000,
      });
      this.logger.log(`CoinGecko ✓ markets (${order}) → ${res.data.length} coins`);
      return res.data.map(toQuote);
    } catch (err) {
      this.logger.warn(`CoinGecko markets fetch failed (${order}): ${String(err)}`);
      return [];
    }
  }
}
