import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { QuantClientService } from "./quant-client.service";
import { RiskFreeRateService } from "./risk-free-rate.service";
import { MarketDataService, type DailyReturn } from "./market-data.service";

const MONTE_CARLO_TTL_S = 60 * 60 * 24; // recompute at most daily unless forced

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

interface HoldingRow {
  id: string;
  type: string;
  value: number;
  currency: string;
}

/**
 * Orchestrates portfolio analytics: gathers real holding data + historical
 * returns from wherever they live (Postgres for composition, MarketDataService
 * for price history/classification), then delegates all actual math to the
 * quant microservice. This service owns NO calculation logic itself — that
 * split (data assembly here, math in Python) is deliberate so the quant
 * engine stays a pure, independently-testable function of its inputs.
 */
@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsService.name);
  private cache!: CacheAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
    private readonly quant: QuantClientService,
    private readonly riskFreeRate: RiskFreeRateService,
    private readonly marketData: MarketDataService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    try {
      const { Redis } = await import("ioredis");
      const redis = new Redis(redisUrl, {
        lazyConnect: true, enableOfflineQueue: false,
        maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 3000,
      });
      redis.on("error", () => {});
      try {
        await redis.connect();
        await redis.ping();
        this.cache = {
          get: (key) => redis.get(key),
          set: (key, value, ttl) => redis.set(key, value, "EX", ttl).then(() => undefined),
        };
        this.logger.log("✓ Redis connected — using Redis analytics cache (Monte Carlo)");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error */ }
    this.logger.warn("Redis unavailable — Monte Carlo results cached in-memory only.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  // ─── Allocation & diversification ────────────────────────────────────────

  async getAllocation(userId: string): Promise<unknown> {
    const assets = await this.loadAssetsWithTypeDetails(userId);
    const holdings = await Promise.all(
      assets.map(async (a) => {
        const meta = await this.classify(a);
        return {
          id: a.id,
          value: Number(a.currentValue.toString()),
          assetClass: a.type,
          currency: a.currencyCode,
          sector: meta.sector,
          geography: meta.geography,
          marketCap: meta.marketCap,
        };
      }),
    );
    if (holdings.length === 0) {
      return { totalValue: 0, overallDiversificationScore: 0, byDimension: {} };
    }
    return this.quant.allocation({
      holdings,
      dimensions: ["assetClass", "sector", "geography", "currency", "marketCap"],
    });
  }

  // ─── Risk metrics (beta, alpha, Sharpe, Sortino, Treynor, vol, drawdown) ──

  async getRiskMetrics(userId: string, benchmark: { ticker: string; exchange: string } = { ticker: "SPY", exchange: "NYSE" }) {
    const { portfolioReturns, portfolioValues } = await this.getPortfolioReturnSeries(userId);
    if (portfolioReturns.length < 2) {
      return { insufficientData: true, reason: "Not enough historical price data across holdings yet" };
    }
    const benchmarkReturns = await this.marketData.getStockReturns(benchmark.ticker, benchmark.exchange);
    if (!benchmarkReturns) {
      return { insufficientData: true, reason: `Could not fetch benchmark data for ${benchmark.ticker}` };
    }
    const aligned = alignByDate(portfolioReturns, benchmarkReturns);
    if (aligned.a.length < 2) {
      return { insufficientData: true, reason: "Not enough overlapping trading days between portfolio and benchmark" };
    }

    const riskFreeRate = await this.riskFreeRate.getPeriodRate(252); // daily returns -> daily rf

    return this.quant.riskMetrics({
      portfolioReturns: aligned.a,
      benchmarkReturns: aligned.b,
      riskFreeRate,
      periodsPerYear: 252,
      portfolioValues: portfolioValues.length > 1 ? portfolioValues : undefined,
    });
  }

  // ─── Correlation matrix ──────────────────────────────────────────────────

  async getCorrelationMatrix(userId: string) {
    const assets = await this.loadAssetsWithTypeDetails(userId);
    const seriesByHolding: Record<string, DailyReturn[]> = {};
    for (const a of assets) {
      const series = await this.getReturnsForAsset(a);
      if (series && series.length >= 30) seriesByHolding[a.id] = series;
    }
    const labels = Object.keys(seriesByHolding);
    if (labels.length < 2) {
      return { insufficientData: true, reason: "Need at least 2 holdings with sufficient price history" };
    }
    const alignedDates = intersectDates(Object.values(seriesByHolding));
    if (alignedDates.length < 10) {
      return { insufficientData: true, reason: "Not enough overlapping historical dates across holdings" };
    }
    const returnsByHolding: Record<string, number[]> = {};
    for (const label of labels) {
      const byDate = new Map(seriesByHolding[label]!.map((r) => [r.date, r.return]));
      returnsByHolding[label] = alignedDates.map((d) => byDate.get(d)!);
    }
    const result = await this.quant.correlation({ returnsByHolding });
    // swap opaque holding ids for display names before returning
    const idToName = new Map(assets.map((a) => [a.id, a.name]));
    const withNames = result as { labels: string[]; matrix: number[][] };
    return { ...withNames, labels: withNames.labels.map((id) => idToName.get(id) ?? id) };
  }

  // ─── Monte Carlo (cached — expensive-ish, and doesn't need to be live) ───

  async getMonteCarlo(userId: string, years = 10, nSimulations = 10_000, forceRefresh = false) {
    const cacheKey = `analytics:mc:${userId}:${years}:${nSimulations}`;
    if (!forceRefresh) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return { ...JSON.parse(cached), cached: true };
    }

    const { portfolioReturns, initialValue } = await this.getPortfolioReturnSeries(userId);
    if (portfolioReturns.length < 30 || initialValue <= 0) {
      return { insufficientData: true, reason: "Not enough historical data to calibrate a projection" };
    }
    const returnValues = portfolioReturns.map((r) => r.return);
    const mu = mean(returnValues);
    const sigma = stdDev(returnValues);

    const result = await this.quant.monteCarlo({
      initialValue,
      mu,
      sigma,
      periods: years * 252,
      nSimulations,
      dt: 1,
      seed: null,
    });
    await this.cache.set(cacheKey, JSON.stringify(result), MONTE_CARLO_TTL_S);
    return { ...(result as object), cached: false };
  }

  // ─── Return-series stats for a specific asset subset (Phase 13 goals) ────

  /**
   * Daily value-weighted mean return and standard deviation across an
   * ARBITRARY SUBSET of a user's assets (or every asset, if `assetIds` is
   * omitted) — reuses the exact same portfolio-return-series assembly as
   * `getRiskMetrics`/`getMonteCarlo` above, just parameterized by which
   * assets to include. This is what lets a Goal linked to specific assets
   * get ITS OWN mu/sigma (e.g. a "House" goal funded by a debt fund
   * shouldn't inherit volatility from an unrelated crypto holding elsewhere
   * in the portfolio) rather than reusing the whole portfolio's risk
   * profile for every goal.
   */
  async getReturnSeriesStats(userId: string, assetIds?: string[]): Promise<{ muDaily: number; sigmaDaily: number; hasSufficientData: boolean }> {
    const { portfolioReturns } = await this.getPortfolioReturnSeries(userId, assetIds);
    if (portfolioReturns.length < 2) return { muDaily: 0, sigmaDaily: 0, hasSufficientData: false };
    const returnValues = portfolioReturns.map((r) => r.return);
    return { muDaily: mean(returnValues), sigmaDaily: stdDev(returnValues), hasSufficientData: true };
  }

  // ─── Internal data assembly ───────────────────────────────────────────────

  private async loadAssetsWithTypeDetails(userId: string, assetIds?: string[]) {
    return this.prisma.asset.findMany({
      where: { userId, deletedAt: null, ...(assetIds && assetIds.length > 0 ? { id: { in: assetIds } } : {}) },
      include: {
        stockHolding: true,
        etfHolding: true,
        cryptoHolding: true,
        mutualFundHolding: true,
      },
    });
  }

  private async classify(asset: Awaited<ReturnType<AnalyticsService["loadAssetsWithTypeDetails"]>>[number]) {
    if (asset.stockHolding) return this.marketData.getStockMetadata(asset.stockHolding.ticker, asset.stockHolding.exchange);
    if (asset.etfHolding) return this.marketData.getStockMetadata(asset.etfHolding.ticker, asset.etfHolding.exchange);
    if (asset.cryptoHolding) return this.marketData.getCryptoMetadata(asset.cryptoHolding.coinId);
    return this.marketData.staticMetadata(asset.type);
  }

  private async getReturnsForAsset(asset: Awaited<ReturnType<AnalyticsService["loadAssetsWithTypeDetails"]>>[number]): Promise<DailyReturn[] | null> {
    if (asset.stockHolding) return this.marketData.getStockReturns(asset.stockHolding.ticker, asset.stockHolding.exchange);
    if (asset.etfHolding) return this.marketData.getStockReturns(asset.etfHolding.ticker, asset.etfHolding.exchange);
    if (asset.cryptoHolding) return this.marketData.getCryptoReturns(asset.cryptoHolding.coinId);
    if (asset.mutualFundHolding) return this.marketData.getMutualFundReturns(asset.mutualFundHolding.schemeCode);
    return this.marketData.getRevaluationReturns(asset.id);
  }

  /** Aggregate, value-weighted daily portfolio return series across every
   * holding that has real history (or a specific subset, via `assetIds`),
   * aligned on common dates. */
  private async getPortfolioReturnSeries(userId: string, assetIds?: string[]): Promise<{ portfolioReturns: DailyReturn[]; portfolioValues: number[]; initialValue: number }> {
    const assets = await this.loadAssetsWithTypeDetails(userId, assetIds);
    const seriesByAsset: Array<{ value: number; series: DailyReturn[] }> = [];
    for (const a of assets) {
      const series = await this.getReturnsForAsset(a);
      if (series && series.length >= 2) seriesByAsset.push({ value: Number(a.currentValue.toString()), series });
    }
    if (seriesByAsset.length === 0) return { portfolioReturns: [], portfolioValues: [], initialValue: 0 };

    const totalValue = seriesByAsset.reduce((s, h) => s + h.value, 0);
    const dates = intersectDates(seriesByAsset.map((h) => h.series));
    const portfolioReturns: DailyReturn[] = dates.map((date) => {
      let weightedReturn = 0;
      for (const h of seriesByAsset) {
        const r = h.series.find((s) => s.date === date)?.return ?? 0;
        weightedReturn += (h.value / totalValue) * r;
      }
      return { date, return: weightedReturn };
    });

    // Reconstruct a value trajectory from the return series for max-drawdown
    // (starting from today's actual total value, walked backward is
    // unnecessary — forward compounding from an arbitrary base is fine
    // since max drawdown only depends on relative moves).
    const portfolioValues: number[] = [totalValue];
    for (const { return: r } of portfolioReturns) portfolioValues.push(portfolioValues[portfolioValues.length - 1]! * (1 + r));

    return { portfolioReturns, portfolioValues, initialValue: totalValue };
  }
}

export function alignByDate(a: DailyReturn[], b: DailyReturn[]): { a: number[]; b: number[] } {
  const bByDate = new Map(b.map((r) => [r.date, r.return]));
  const outA: number[] = [];
  const outB: number[] = [];
  for (const r of a) {
    const bVal = bByDate.get(r.date);
    if (bVal !== undefined) {
      outA.push(r.return);
      outB.push(bVal);
    }
  }
  return { a: outA, b: outB };
}

export function intersectDates(seriesList: DailyReturn[][]): string[] {
  if (seriesList.length === 0) return [];
  let common = new Set(seriesList[0]!.map((r) => r.date));
  for (const series of seriesList.slice(1)) {
    const dates = new Set(series.map((r) => r.date));
    common = new Set([...common].filter((d) => dates.has(d)));
  }
  return [...common].sort();
}

export function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdDev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
