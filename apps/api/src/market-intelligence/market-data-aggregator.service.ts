import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PriceSyncService } from "../stocks/price-sync.service";
import { CryptoPriceSyncService } from "../crypto/crypto-price-sync.service";
import { CommodityPriceSyncService } from "../commodities/commodity-price-sync.service";
import { PreciousMetalPriceSyncService } from "../precious-metals/precious-metal-price-sync.service";
import { CurrencyService } from "../forex/currency.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";

const OVERVIEW_CACHE_TTL_S = 120; // rollup of already-cached underlying quotes — short TTL is fine
const OVERVIEW_CACHE_KEY = "market-intel:overview";

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

/**
 * Curated index-tracking ETF proxies. Free-tier Alpha Vantage/Finnhub don't
 * reliably support raw `^`-prefixed index symbols (e.g. ^GSPC), so — same
 * "be honest about what the data actually is" spirit as the emergency-fund
 * and risk-free-rate fallbacks — these are labeled `isIndexProxy: true`
 * rather than presented as literal index values.
 */
const INDEX_PROXIES: { label: string; ticker: string; exchange: string; region: string }[] = [
  { label: "S&P 500 (SPY)", ticker: "SPY", exchange: "NYSE", region: "US" },
  { label: "Dow Jones (DIA)", ticker: "DIA", exchange: "NYSE", region: "US" },
  { label: "Nasdaq 100 (QQQ)", ticker: "QQQ", exchange: "NASDAQ", region: "US" },
  { label: "Japan (EWJ)", ticker: "EWJ", exchange: "NYSE", region: "Japan" },
  { label: "UK (EWU)", ticker: "EWU", exchange: "NYSE", region: "UK" },
  { label: "India Nifty 50 (NIFTYBEES)", ticker: "NIFTYBEES", exchange: "NSE", region: "India" },
];

const CURRENCY_PAIRS: { from: string; to: string }[] = [
  { from: "USD", to: "INR" },
  { from: "EUR", to: "USD" },
  { from: "GBP", to: "USD" },
  { from: "USD", to: "JPY" },
];

const CRYPTO_COINS: { coinId: string; symbol: string; name: string }[] = [
  { coinId: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { coinId: "ethereum", symbol: "ETH", name: "Ethereum" },
  { coinId: "solana", symbol: "SOL", name: "Solana" },
  { coinId: "ripple", symbol: "XRP", name: "XRP" },
  { coinId: "cardano", symbol: "ADA", name: "Cardano" },
];

/** 25 large-cap US tickers — plenty for a top-5/top-5 rollup without
 * threatening the free-tier provider rate limits (per the task spec). */
const GAINER_LOSER_UNIVERSE: { ticker: string; exchange: string }[] = [
  { ticker: "AAPL", exchange: "NASDAQ" }, { ticker: "MSFT", exchange: "NASDAQ" },
  { ticker: "GOOGL", exchange: "NASDAQ" }, { ticker: "AMZN", exchange: "NASDAQ" },
  { ticker: "NVDA", exchange: "NASDAQ" }, { ticker: "META", exchange: "NASDAQ" },
  { ticker: "TSLA", exchange: "NASDAQ" }, { ticker: "AVGO", exchange: "NASDAQ" },
  { ticker: "JPM", exchange: "NYSE" }, { ticker: "V", exchange: "NYSE" },
  { ticker: "WMT", exchange: "NYSE" }, { ticker: "UNH", exchange: "NYSE" },
  { ticker: "XOM", exchange: "NYSE" }, { ticker: "JNJ", exchange: "NYSE" },
  { ticker: "PG", exchange: "NYSE" }, { ticker: "MA", exchange: "NYSE" },
  { ticker: "HD", exchange: "NYSE" }, { ticker: "CVX", exchange: "NYSE" },
  { ticker: "ABBV", exchange: "NYSE" }, { ticker: "KO", exchange: "NYSE" },
  { ticker: "PEP", exchange: "NASDAQ" }, { ticker: "COST", exchange: "NASDAQ" },
  { ticker: "MRK", exchange: "NYSE" }, { ticker: "BAC", exchange: "NYSE" },
  { ticker: "DIS", exchange: "NYSE" },
];

export interface IndexQuote {
  label: string;
  ticker: string;
  exchange: string;
  region: string;
  isIndexProxy: true;
  price: number | null;
  changePercent: number | null;
  currency: string | null;
  isStale: boolean;
}

export interface CurrencyQuote {
  pair: string; // e.g. "USD/INR"
  from: string;
  to: string;
  rate: number;
}

export interface CryptoQuote {
  coinId: string;
  symbol: string;
  name: string;
  price: number | null;
  currency: string;
  change24hPct: number | null;
  isStale: boolean;
}

export interface CommodityQuote {
  code: "GOLD" | "SILVER" | "OIL";
  label: string;
  price: number | null;
  unit: string;
  currency: string;
  isStale: boolean;
}

export interface MoverQuote {
  ticker: string;
  exchange: string;
  price: number;
  previousClose: number;
  changePercent: number;
  currency: string;
}

export interface MarketOverview {
  indices: IndexQuote[];
  currencies: CurrencyQuote[];
  crypto: CryptoQuote[];
  commodities: CommodityQuote[];
  gainers: MoverQuote[];
  losers: MoverQuote[];
  fetchedAt: string;
  cacheTtlSeconds: number;
}

/**
 * Rolls up world-index proxies, currencies, crypto, commodities, and
 * top gainers/losers into one payload for the Markets page. Every quote is
 * read through the existing Phase 4/6/7 price-sync services' own caches
 * (PriceSyncService.getPrice, CryptoPriceSyncService.getPrice, etc.) — this
 * service never calls a provider directly, it only aggregates. The
 * aggregate response itself is cached briefly (2 min) so a page load
 * doesn't re-run ~35 read-through calls on every request.
 */
@Injectable()
export class MarketDataAggregatorService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataAggregatorService.name);
  private cache!: CacheAdapter;

  constructor(
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
    private readonly priceSync: PriceSyncService,
    private readonly cryptoSync: CryptoPriceSyncService,
    private readonly commoditySync: CommodityPriceSyncService,
    private readonly metalSync: PreciousMetalPriceSyncService,
    private readonly currency: CurrencyService,
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
        this.logger.log("✓ Redis connected — using Redis market-overview cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error — unusual */ }

    this.logger.warn("Redis unavailable — falling back to in-memory cache for market overview.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  async getOverview(): Promise<MarketOverview> {
    const cached = await this.cache.get(OVERVIEW_CACHE_KEY);
    if (cached) return JSON.parse(cached) as MarketOverview;

    const [indices, currencies, crypto, commodities, movers] = await Promise.all([
      this.getIndices(),
      this.getCurrencies(),
      this.getCrypto(),
      this.getCommodities(),
      this.getGainersLosers(),
    ]);

    const overview: MarketOverview = {
      indices,
      currencies,
      crypto,
      commodities,
      gainers: movers.gainers,
      losers: movers.losers,
      fetchedAt: new Date().toISOString(),
      cacheTtlSeconds: OVERVIEW_CACHE_TTL_S,
    };

    await this.cache.set(OVERVIEW_CACHE_KEY, JSON.stringify(overview), OVERVIEW_CACHE_TTL_S);
    return overview;
  }

  private async getIndices(): Promise<IndexQuote[]> {
    return Promise.all(
      INDEX_PROXIES.map(async (proxy): Promise<IndexQuote> => {
        try {
          const quote = await this.priceSync.getPrice(proxy.ticker, proxy.exchange);
          const changePercent =
            quote?.previousClose && quote.previousClose > 0
              ? ((quote.price - quote.previousClose) / quote.previousClose) * 100
              : null;
          return {
            label: proxy.label,
            ticker: proxy.ticker,
            exchange: proxy.exchange,
            region: proxy.region,
            isIndexProxy: true,
            price: quote?.price ?? null,
            changePercent,
            currency: quote?.currency ?? null,
            isStale: quote?.isStale ?? true,
          };
        } catch (err) {
          this.logger.warn(`Index proxy fetch failed for ${proxy.ticker}: ${String(err)}`);
          return {
            label: proxy.label, ticker: proxy.ticker, exchange: proxy.exchange, region: proxy.region,
            isIndexProxy: true, price: null, changePercent: null, currency: null, isStale: true,
          };
        }
      }),
    );
  }

  private async getCurrencies(): Promise<CurrencyQuote[]> {
    return Promise.all(
      CURRENCY_PAIRS.map(async (pair): Promise<CurrencyQuote> => {
        try {
          const rate = await this.currency.getRate(pair.from, pair.to);
          return { pair: `${pair.from}/${pair.to}`, from: pair.from, to: pair.to, rate: rate.toNumber() };
        } catch (err) {
          this.logger.warn(`Currency rate fetch failed for ${pair.from}/${pair.to}: ${String(err)}`);
          return { pair: `${pair.from}/${pair.to}`, from: pair.from, to: pair.to, rate: 0 };
        }
      }),
    );
  }

  private async getCrypto(): Promise<CryptoQuote[]> {
    return Promise.all(
      CRYPTO_COINS.map(async (coin): Promise<CryptoQuote> => {
        try {
          const quote = await this.cryptoSync.getPrice(coin.coinId, "USD");
          return {
            coinId: coin.coinId, symbol: coin.symbol, name: coin.name,
            price: quote?.price ?? null, currency: "USD",
            change24hPct: quote?.change24hPct ?? null, isStale: quote?.isStale ?? true,
          };
        } catch (err) {
          this.logger.warn(`Crypto fetch failed for ${coin.coinId}: ${String(err)}`);
          return { coinId: coin.coinId, symbol: coin.symbol, name: coin.name, price: null, currency: "USD", change24hPct: null, isStale: true };
        }
      }),
    );
  }

  private async getCommodities(): Promise<CommodityQuote[]> {
    const [gold, silver, oil] = await Promise.all([
      this.metalSync.getPrice("GOLD").catch(() => null),
      this.metalSync.getPrice("SILVER").catch(() => null),
      this.commoditySync.getPrice("OIL").catch(() => null),
    ]);

    return [
      { code: "GOLD", label: "Gold", price: gold?.pricePerOzUsd ?? null, unit: "oz", currency: "USD", isStale: gold?.isStale ?? true },
      { code: "SILVER", label: "Silver", price: silver?.pricePerOzUsd ?? null, unit: "oz", currency: "USD", isStale: silver?.isStale ?? true },
      { code: "OIL", label: "Crude Oil (WTI)", price: oil?.price ?? null, unit: "barrel", currency: "USD", isStale: oil?.isStale ?? true },
    ];
  }

  private async getGainersLosers(): Promise<{ gainers: MoverQuote[]; losers: MoverQuote[] }> {
    const quotes = await Promise.all(
      GAINER_LOSER_UNIVERSE.map(async (u) => {
        try {
          return await this.priceSync.getPrice(u.ticker, u.exchange);
        } catch (err) {
          this.logger.warn(`Mover fetch failed for ${u.ticker}: ${String(err)}`);
          return null;
        }
      }),
    );

    const movers: MoverQuote[] = quotes
      .filter((q): q is NonNullable<typeof q> => q !== null && q.previousClose !== null && q.previousClose > 0)
      .map((q) => ({
        ticker: q.ticker,
        exchange: q.exchange,
        price: q.price,
        previousClose: q.previousClose as number,
        changePercent: ((q.price - (q.previousClose as number)) / (q.previousClose as number)) * 100,
        currency: q.currency,
      }));

    const sorted = [...movers].sort((a, b) => b.changePercent - a.changePercent);
    return {
      gainers: sorted.slice(0, 5),
      losers: sorted.slice(-5).reverse(),
    };
  }
}
