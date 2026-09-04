import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { LiabilitiesService } from "../liabilities/liabilities.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { RiskFreeRateService } from "../analytics/risk-free-rate.service";
import { MacroDataService } from "./macro-data.service";
import {
  liquidityRisk,
  debtRisk,
  inflationRisk,
  currencyRisk,
  marketRisk,
  interestRateRisk,
  creditRisk,
  overallRiskScore,
  isInsufficientRiskSubScore,
  type AnyRiskSubScore,
} from "./risk-scoring";

const PROFILE_TTL_S = 60 * 60 * 6; // 6h — bounds the cost of the FRED + Phase-11-analytics + multi-table fan-out below
const CACHE_KEY_PREFIX = "risk-profile:";

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

export interface RiskProfile {
  overallScore: number | null;
  subScores: AnyRiskSubScore[];
  computedAt: string;
  cached: boolean;
}

export interface RiskTrendPoint {
  date: string;
  overallScore: number;
}

// Analytics (Phase 11) risk-metrics response shapes, mirrored here rather
// than importing from analytics.service.ts (which returns `unknown`) — see
// apps/web/src/hooks/useAnalytics.ts for the frontend's identical mirror.
interface AnalyticsRiskMetrics {
  beta: number;
  volatility: number;
  maxDrawdown: number | null;
}
interface AnalyticsInsufficientData {
  insufficientData: true;
  reason: string;
}
function isAnalyticsInsufficient(x: unknown): x is AnalyticsInsufficientData {
  return typeof x === "object" && x !== null && "insufficientData" in x;
}

/**
 * Orchestrates the Phase 12 risk profile: gathers inputs from Phase 9
 * (liabilities/debt), Phase 11 (market analytics), the net-worth engine
 * (liquidity/currency composition), and FRED (macro inflation/rates), then
 * delegates every actual score calculation to the pure functions in
 * risk-scoring.ts. This service owns NO scoring math itself — same
 * data-assembly-vs-calculation split as AnalyticsService in Phase 11.
 *
 * The full methodology (every weight, every threshold, and the reasoning
 * behind each) is documented in RISK_METHODOLOGY.md at the repo root.
 */
@Injectable()
export class RiskEngineService implements OnModuleInit {
  private readonly logger = new Logger(RiskEngineService.name);
  private cache!: CacheAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
    private readonly netWorth: NetWorthService,
    private readonly liabilities: LiabilitiesService,
    private readonly analytics: AnalyticsService,
    private readonly riskFreeRate: RiskFreeRateService,
    private readonly macroData: MacroDataService,
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
        this.logger.log("✓ Redis connected — using Redis risk-profile cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error */ }
    this.logger.warn("Redis unavailable — risk profiles cached in-memory only.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  /** Full risk profile — cached 6h, and writes today's RiskScoreSnapshot on every fresh computation. */
  async getRiskProfile(userId: string, forceRefresh = false): Promise<RiskProfile> {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    if (!forceRefresh) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return { ...(JSON.parse(cached) as Omit<RiskProfile, "cached">), cached: true };
    }

    const subScores = await this.computeSubScores(userId);
    const overallScore = overallRiskScore(subScores);
    const profile: RiskProfile = { overallScore, subScores, computedAt: new Date().toISOString(), cached: false };

    await this.cache.set(cacheKey, JSON.stringify({ overallScore, subScores, computedAt: profile.computedAt }), PROFILE_TTL_S);
    if (overallScore !== null) await this.writeSnapshot(userId, overallScore, subScores);
    return profile;
  }

  /** Last 12 months of daily risk-score snapshots, oldest first — mirrors NetWorthService.getTrendSnapshots. */
  async getRiskTrend(userId: string): Promise<RiskTrendPoint[]> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const snapshots = await this.prisma.riskScoreSnapshot.findMany({
      where: { userId, snapshotDate: { gte: oneYearAgo } },
      orderBy: { snapshotDate: "asc" },
      select: { snapshotDate: true, overallScore: true },
    });

    return snapshots.map((s): RiskTrendPoint => ({
      date: s.snapshotDate.toISOString().slice(0, 10),
      overallScore: s.overallScore,
    }));
  }

  // ─── Data assembly ────────────────────────────────────────────────────────

  private async computeSubScores(userId: string): Promise<AnyRiskSubScore[]> {
    const [netWorthResult, liabilitiesSummary, creditCardSummary, personalLoanSummary, riskMetricsRaw, riskFreeRate, inflation, creditExposure] =
      await Promise.all([
        this.netWorth.calculateNetWorth(userId),
        this.liabilities.getPortfolioSummary(userId),
        this.liabilities.getPortfolioSummary(userId, "CREDIT_CARD"),
        this.liabilities.getPortfolioSummary(userId, "PERSONAL_LOAN"),
        this.analytics.getRiskMetrics(userId),
        this.riskFreeRate.getAnnualRate(),
        this.macroData.getInflationRate(),
        this.getCreditExposurePercent(userId),
      ]);

    const totalAssets = netWorthResult.totalAssets.toNumber();
    const cashPercent = netWorthResult.assetAllocation.find((a) => a.category === "CASH")?.percentage ?? 0;
    const bondPercent = netWorthResult.assetAllocation.find((a) => a.category === "BOND")?.percentage ?? 0;
    const baseCurrency = netWorthResult.baseCurrency;
    const nonBaseExposure = netWorthResult.currencyExposure.filter((c) => c.currency !== baseCurrency);
    const foreignCurrencyPercent = nonBaseExposure.reduce((sum, c) => sum + c.percentage, 0);
    const dominantForeignCurrency = nonBaseExposure.sort((a, b) => b.percentage - a.percentage)[0]?.currency ?? null;

    const variableDebtOutstanding = (creditCardSummary?.totalOutstanding ?? 0) + (personalLoanSummary?.totalOutstanding ?? 0);
    const totalDebtOutstanding = liabilitiesSummary?.totalOutstanding ?? 0;
    const variableDebtPercent = totalDebtOutstanding > 0 ? (variableDebtOutstanding / totalDebtOutstanding) * 100 : 0;

    const subScores: AnyRiskSubScore[] = [
      liquidityRisk({ cashPercent }),
      debtRisk({ debtRatio: netWorthResult.debtRatio }),
      inflationRisk({ inflationExposedPercent: cashPercent + bondPercent, currentInflationPct: inflation.yoyPct }),
      currencyRisk({ foreignCurrencyPercent, baseCurrency, dominantForeignCurrency }),
      this.buildMarketRiskSubScore(riskMetricsRaw),
      interestRateRisk({ variableDebtPercent, currentShortRatePct: riskFreeRate.annualRatePct }),
      creditRisk({ creditExposedPercent: creditExposure }),
    ];

    if (totalAssets === 0) {
      this.logger.warn(`Risk profile computed for user ${userId} with zero total assets — most scores will read as maximally risky (no cash, no diversification).`);
    }
    return subScores;
  }

  private buildMarketRiskSubScore(raw: unknown): AnyRiskSubScore {
    if (isAnalyticsInsufficient(raw)) {
      return { key: "market", label: "Market Risk", insufficientData: true, reason: raw.reason };
    }
    const metrics = raw as AnalyticsRiskMetrics;
    return marketRisk({ volatility: metrics.volatility, beta: metrics.beta, maxDrawdown: metrics.maxDrawdown });
  }

  /**
   * Weighted % of total assets exposed to issuer/counterparty default risk:
   * corporate bonds (0.6), municipal bonds (0.3), govt/SGB bonds (0.05), and
   * P2P lending (1.0). Bond-type PROPORTIONS come from a direct query of
   * BondHolding rows (native-currency asset values — a documented
   * simplification when bonds span multiple currencies, since only the
   * relative split between bond types is needed here); the BOND and
   * P2P_LENDING category TOTALS come from NetWorthService's already
   * base-currency-converted assetAllocation, so the final percentage is
   * correctly weighted against total assets.
   */
  private async getCreditExposurePercent(userId: string): Promise<number> {
    const [netWorthResult, bondAssets] = await Promise.all([
      this.netWorth.calculateNetWorth(userId),
      this.prisma.asset.findMany({
        where: { userId, deletedAt: null, type: "BOND" },
        include: { bondHolding: true },
      }),
    ]);

    const bondPercent = netWorthResult.assetAllocation.find((a) => a.category === "BOND")?.percentage ?? 0;
    const p2pPercent = netWorthResult.assetAllocation.find((a) => a.category === "P2P_LENDING")?.percentage ?? 0;

    let corporateValue = 0;
    let municipalValue = 0;
    let govtValue = 0;
    for (const asset of bondAssets) {
      const value = Number(asset.currentValue.toString());
      const bondType = asset.bondHolding?.bondType ?? "CORPORATE";
      if (bondType === "CORPORATE") corporateValue += value;
      else if (bondType === "MUNICIPAL") municipalValue += value;
      else govtValue += value; // GOVT, SGB
    }
    const totalBondValue = corporateValue + municipalValue + govtValue;
    const corporateShare = totalBondValue > 0 ? corporateValue / totalBondValue : 0;
    const municipalShare = totalBondValue > 0 ? municipalValue / totalBondValue : 0;
    const govtShare = totalBondValue > 0 ? govtValue / totalBondValue : 0;

    const bondCreditContribution = bondPercent * (corporateShare * 0.6 + municipalShare * 0.3 + govtShare * 0.05);
    return bondCreditContribution + p2pPercent * 1.0;
  }

  private async writeSnapshot(userId: string, overallScore: number, subScores: AnyRiskSubScore[]): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
      await this.prisma.riskScoreSnapshot.upsert({
        where: { userId_snapshotDate: { userId, snapshotDate: today } },
        create: { userId, overallScore, subScores: subScores as unknown as object, snapshotDate: today },
        update: { overallScore, subScores: subScores as unknown as object },
      });
    } catch (err) {
      this.logger.error(`Failed to write risk-score snapshot for ${userId}`, err);
    }
  }
}

export { isInsufficientRiskSubScore };
