import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import axios from "axios";

export interface LiveMetalPrice {
  metal: "GOLD" | "SILVER";
  pricePerGramUsd: number;
  pricePerOzUsd: number;
  provider: string;
  fetchedAt: string; // ISO string
  isStale: boolean;
}

/** Gold/silver spot moves slowly intraday — a longer TTL than crypto's 3min is fine. */
const PRICE_TTL_S = 60 * 15; // 15 min

const TROY_OZ_TO_GRAMS = 31.1034768;

const GOLD_API_SYMBOL: Record<"GOLD" | "SILVER", string> = { GOLD: "XAU", SILVER: "XAG" };

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: "EX", ttl: number): Promise<void>;
}

function priceKey(metal: string): string {
  return `metal:price:${metal}`;
}

@Injectable()
export class PreciousMetalPriceSyncService implements OnModuleInit {
  private readonly logger = new Logger(PreciousMetalPriceSyncService.name);
  private readonly goldApiIoKey: string;
  private cache!: CacheAdapter;

  constructor(
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
  ) {
    // goldapi.io (the provider literally named in the spec) requires a real
    // signup key — confirmed via curl: 403 Invalid API Key even with the
    // "goldapi-demo" token. Wired in as an optional secondary provider,
    // same shape as FINNHUB_KEY/TWELVE_DATA_KEY elsewhere in this app.
    this.goldApiIoKey = this.config.get<string>("GOLDAPI_IO_KEY") ?? "";
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
        this.logger.log("✓ Redis connected — using Redis precious-metal price cache");
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

  async getPrice(metal: "GOLD" | "SILVER"): Promise<LiveMetalPrice | null> {
    const key = priceKey(metal);
    const cached = await this.cache.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as LiveMetalPrice;
      const ageMs = Date.now() - new Date(parsed.fetchedAt).getTime();
      parsed.isStale = ageMs > PRICE_TTL_S * 1000;
      return parsed;
    }
    return this.refreshPrice(metal);
  }

  async refreshPrice(metal: "GOLD" | "SILVER"): Promise<LiveMetalPrice | null> {
    let price = await this.fetchGoldApiCom(metal);
    if (!price && this.goldApiIoKey) price = await this.fetchGoldApiIo(metal);

    if (!price) {
      this.logger.error(`All precious-metal price providers failed for ${metal}`);
      return null;
    }

    await this.cache.set(priceKey(metal), JSON.stringify(price), "EX", PRICE_TTL_S);
    return price;
  }

  // ─── Providers ──────────────────────────────────────────────────────────────

  /** gold-api.com — verified live, free, no API key required. */
  private async fetchGoldApiCom(metal: "GOLD" | "SILVER"): Promise<LiveMetalPrice | null> {
    try {
      const symbol = GOLD_API_SYMBOL[metal];
      const res = await axios.get<{ price: number; currency: string }>(
        `https://api.gold-api.com/price/${symbol}`,
        { timeout: 8000 },
      );
      const pricePerOzUsd = res.data.price;
      if (!pricePerOzUsd) return null;

      this.logger.log(`gold-api.com ✓ ${metal} → $${pricePerOzUsd}/oz`);
      return {
        metal,
        pricePerOzUsd,
        pricePerGramUsd: pricePerOzUsd / TROY_OZ_TO_GRAMS,
        provider: "gold-api.com",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`gold-api.com fetch failed for ${metal}: ${String(err)}`);
      return null;
    }
  }

  /** goldapi.io — key-gated secondary, activates automatically once a real key is configured. */
  private async fetchGoldApiIo(metal: "GOLD" | "SILVER"): Promise<LiveMetalPrice | null> {
    try {
      const symbol = GOLD_API_SYMBOL[metal];
      const res = await axios.get<{ price_gram_24k?: number; price: number }>(
        `https://www.goldapi.io/api/${symbol}/USD`,
        { timeout: 8000, headers: { "x-access-token": this.goldApiIoKey } },
      );
      const pricePerOzUsd = res.data.price;
      if (!pricePerOzUsd) return null;

      this.logger.log(`goldapi.io ✓ ${metal} → $${pricePerOzUsd}/oz`);
      return {
        metal,
        pricePerOzUsd,
        pricePerGramUsd: res.data.price_gram_24k ?? pricePerOzUsd / TROY_OZ_TO_GRAMS,
        provider: "goldapi.io",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`goldapi.io fetch failed for ${metal}: ${String(err)}`);
      return null;
    }
  }
}
