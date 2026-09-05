import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { NewsApiProvider } from "./providers/newsapi.provider";
import { GNewsProvider } from "./providers/gnews.provider";
import { FinnhubNewsProvider } from "./providers/finnhub-news.provider";
import type { NewsProvider } from "./providers/news-provider.interface";
import { buildPersonalizedFeed, type HoldingKeyword, type NewsArticle, type RawNewsArticle } from "@richer/shared-types";

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

/**
 * 20 minutes: NewsAPI's free tier caps at 100 requests/day. General-news
 * fetch here is per-provider (not per-user) and shared across all users via
 * this one cache key, so at a 20-min TTL this is at most ~72 calls/day to
 * any single provider even under constant traffic — comfortably inside
 * NewsAPI's budget with headroom, while still feeling close to live.
 */
const GENERAL_NEWS_TTL_S = 60 * 20;
const GENERAL_NEWS_CACHE_KEY = "news:general";

@Injectable()
export class NewsService implements OnModuleInit {
  private readonly logger = new Logger(NewsService.name);
  private cache!: CacheAdapter;
  private readonly providers: NewsProvider[];

  constructor(
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
    private readonly prisma: PrismaService,
    newsApi: NewsApiProvider,
    gnews: GNewsProvider,
    finnhub: FinnhubNewsProvider,
  ) {
    // NewsAPI is dev-only (its own isAvailable() enforces this); GNews is
    // the production-safe general source; Finnhub is always a secondary,
    // finance-specific layer on top of whichever general provider is live.
    this.providers = [newsApi, gnews, finnhub];
  }

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
        this.logger.log("✓ Redis connected — using Redis news cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache for news.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  /** General market news, deduplicated across every available provider — no personalization, no auth required. */
  async getGeneralNews(): Promise<NewsArticle[]> {
    const raw = await this.getRawArticles();
    return buildPersonalizedFeed(raw, []); // dedup only — empty holdings means nothing is "personalized"
  }

  /** The same deduplicated article set, tagged and sorted against `userId`'s actual holdings. */
  async getPersonalizedNews(userId: string): Promise<NewsArticle[]> {
    const [raw, holdings] = await Promise.all([
      this.getRawArticles(),
      this.getHoldingKeywords(userId),
    ]);
    return buildPersonalizedFeed(raw, holdings);
  }

  private async getRawArticles(): Promise<RawNewsArticle[]> {
    const cached = await this.cache.get(GENERAL_NEWS_CACHE_KEY);
    if (cached) return JSON.parse(cached) as RawNewsArticle[];

    const available = this.providers.filter((p) => p.isAvailable());
    if (available.length === 0) {
      this.logger.warn("No news provider available (no NEWSAPI_KEY/GNEWS_API_KEY/FINNHUB_KEY configured for this environment) — returning empty feed.");
      return [];
    }

    const results = await Promise.all(available.map((p) => p.fetchGeneralMarketNews()));
    const raw = results.flat();
    if (raw.length > 0) await this.cache.set(GENERAL_NEWS_CACHE_KEY, JSON.stringify(raw), GENERAL_NEWS_TTL_S);
    return raw;
  }

  /** Real holdings → keyword list: stock ticker + company name (from Asset.name), crypto symbol + name. */
  private async getHoldingKeywords(userId: string): Promise<HoldingKeyword[]> {
    const [stocks, cryptos] = await Promise.all([
      this.prisma.stockHolding.findMany({
        where: { userId, asset: { deletedAt: null } },
        select: { ticker: true, asset: { select: { name: true } } },
      }),
      this.prisma.cryptoHolding.findMany({
        where: { userId, asset: { deletedAt: null } },
        select: { symbol: true, name: true },
      }),
    ]);

    const keywords: HoldingKeyword[] = [];
    for (const s of stocks) {
      keywords.push({ label: s.ticker, keywords: uniqueKeywords(s.ticker, s.asset.name) });
    }
    for (const c of cryptos) {
      keywords.push({ label: c.symbol, keywords: uniqueKeywords(c.symbol, c.name) });
    }
    return keywords;
  }
}

/**
 * Real headlines almost always use a company's short/common name ("Apple
 * Reports Record Revenue"), not its full legal name ("Apple Inc."), so
 * matching only the exact legal name would silently miss most real
 * articles. Strip common corporate suffixes to also generate the short
 * form, and match against both.
 */
const CORPORATE_SUFFIX_RE =
  / (?:inc|incorporated|corp|corporation|co|company|ltd|limited|llc|plc|group|holdings?|s\.?a\.?|n\.?v\.?|ag)\.?$/i;

function shortCompanyName(fullName: string): string {
  return fullName.replace(CORPORATE_SUFFIX_RE, "").trim();
}

function uniqueKeywords(symbol: string, fullName: string): string[] {
  const short = shortCompanyName(fullName);
  return Array.from(new Set([symbol, fullName, short].filter((k) => k.length > 0)));
}
