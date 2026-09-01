import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import axios from "axios";

export type CommodityCode = "OIL" | "NATURAL_GAS" | "WHEAT" | "COFFEE" | "CORN" | "COPPER";

export interface LiveCommodityPrice {
  commodity: CommodityCode;
  price: number;      // normalized to `currency` per the display unit in COMMODITY_META
  currency: string;   // always "USD" — Yahoo/Alpha Vantage futures are USD-quoted
  provider: string;
  fetchedAt: string;
  isStale: boolean;
}

/** Yahoo Finance futures ticker per commodity, and whether its raw quote needs
 * cents→dollars normalization ("USX" currency code from Yahoo = US cents). */
export const COMMODITY_META: Record<CommodityCode, { yahooSymbol: string; unit: string; centsQuoted: boolean; alphaVantageFunction: string }> = {
  OIL:          { yahooSymbol: "CL=F", unit: "barrel", centsQuoted: false, alphaVantageFunction: "WTI" },
  NATURAL_GAS:  { yahooSymbol: "NG=F", unit: "MMBtu",  centsQuoted: false, alphaVantageFunction: "NATURAL_GAS" },
  WHEAT:        { yahooSymbol: "ZW=F", unit: "bushel", centsQuoted: true,  alphaVantageFunction: "WHEAT" },
  COFFEE:       { yahooSymbol: "KC=F", unit: "lb",     centsQuoted: true,  alphaVantageFunction: "COFFEE" },
  CORN:         { yahooSymbol: "ZC=F", unit: "bushel", centsQuoted: true,  alphaVantageFunction: "CORN" },
  COPPER:       { yahooSymbol: "HG=F", unit: "lb",     centsQuoted: false, alphaVantageFunction: "COPPER" },
};

/** Futures settle once/day outside market hours; a 15-min TTL matches the
 * cadence used for stocks (Phase 4) and precious metals. */
const PRICE_TTL_S = 60 * 15;

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: "EX", ttl: number): Promise<void>;
}

function priceKey(commodity: string): string {
  return `commodity:price:${commodity}`;
}

@Injectable()
export class CommodityPriceSyncService implements OnModuleInit {
  private readonly logger = new Logger(CommodityPriceSyncService.name);
  private readonly alphaVantageKey: string;
  private cache!: CacheAdapter;

  constructor(
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
  ) {
    // Alpha Vantage's commodity endpoints (WTI, NATURAL_GAS, WHEAT, etc.) need
    // a real key — confirmed via curl that the "demo" key doesn't work for
    // them, and no ALPHA_VANTAGE_KEY is configured in this app's .env. Wired
    // in as an optional secondary exactly like the other key-gated providers.
    // NOTE: this key is shared with the Phase 4 stocks module's Alpha Vantage
    // fallback path (same free-tier request budget, ~25 calls/day) — do not
    // add a separate cron that hammers it independently of stocks' usage.
    this.alphaVantageKey = this.config.get<string>("ALPHA_VANTAGE_KEY") ?? "";
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
        this.logger.log("✓ Redis connected — using Redis commodity price cache");
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

  async getPrice(commodity: CommodityCode): Promise<LiveCommodityPrice | null> {
    const key = priceKey(commodity);
    const cached = await this.cache.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as LiveCommodityPrice;
      const ageMs = Date.now() - new Date(parsed.fetchedAt).getTime();
      parsed.isStale = ageMs > PRICE_TTL_S * 1000;
      return parsed;
    }
    return this.refreshPrice(commodity);
  }

  async refreshPrice(commodity: CommodityCode): Promise<LiveCommodityPrice | null> {
    let price = await this.fetchYahoo(commodity);
    if (!price && this.alphaVantageKey) price = await this.fetchAlphaVantage(commodity);

    if (!price) {
      this.logger.error(`All commodity price providers failed for ${commodity}`);
      return null;
    }

    await this.cache.set(priceKey(commodity), JSON.stringify(price), "EX", PRICE_TTL_S);
    return price;
  }

  // ─── Providers ──────────────────────────────────────────────────────────────

  /** Yahoo Finance futures chart endpoint — verified live, free, no key. */
  private async fetchYahoo(commodity: CommodityCode): Promise<LiveCommodityPrice | null> {
    const meta = COMMODITY_META[commodity];
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahooSymbol)}?interval=1d&range=1d`;
      const res = await axios.get<{
        chart: { result: Array<{ meta: { regularMarketPrice: number; currency?: string } }> | null };
      }>(url, { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0 (compatible; RicherWealth/1.0)" } });

      const result = res.data?.chart?.result?.[0];
      const rawPrice = result?.meta?.regularMarketPrice;
      if (!rawPrice) {
        this.logger.warn(`Yahoo: no price for ${meta.yahooSymbol}`);
        return null;
      }

      // "USX" from Yahoo means US cents — normalize to whole USD for
      // consistency with OIL/NATURAL_GAS/COPPER, which quote in whole dollars.
      const price = meta.centsQuoted ? rawPrice / 100 : rawPrice;

      this.logger.log(`Yahoo ✓ ${commodity} (${meta.yahooSymbol}) → $${price}/${meta.unit}`);
      return {
        commodity,
        price,
        currency: "USD",
        provider: "yahoo_finance",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`Yahoo Finance fetch failed for ${commodity}: ${String(err)}`);
      return null;
    }
  }

  /** Alpha Vantage commodities endpoint — key-gated secondary. */
  private async fetchAlphaVantage(commodity: CommodityCode): Promise<LiveCommodityPrice | null> {
    const meta = COMMODITY_META[commodity];
    try {
      const url = `https://www.alphavantage.co/query?function=${meta.alphaVantageFunction}&interval=daily&apikey=${this.alphaVantageKey}`;
      const res = await axios.get<{ data?: Array<{ value: string }> }>(url, { timeout: 8000 });
      const raw = res.data?.data?.[0]?.value;
      const price = raw ? parseFloat(raw) : NaN;
      if (!price || Number.isNaN(price)) return null;

      this.logger.log(`Alpha Vantage ✓ ${commodity} → $${price}`);
      return {
        commodity,
        price: meta.centsQuoted ? price / 100 : price,
        currency: "USD",
        provider: "alpha_vantage",
        fetchedAt: new Date().toISOString(),
        isStale: false,
      };
    } catch (err) {
      this.logger.warn(`Alpha Vantage fetch failed for ${commodity}: ${String(err)}`);
      return null;
    }
  }
}
