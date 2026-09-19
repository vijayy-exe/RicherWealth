import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { MemoryCacheService } from "../stocks/memory-cache.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { RiskEngineService } from "../risk/risk-engine.service";
import { IncomeService } from "../income/income.service";
import { TransactionsService } from "../transactions/transactions.service";
import { HarvestingService } from "../tax/harvesting.service";
import { GoalsService } from "../goals/goals.service";
import {
  diversificationHealth,
  riskCompositeHealth,
  savingsRateHealth,
  taxEfficiencyHealth,
  goalProgressHealth,
  insuranceAdequacyHealth,
  overallWealthHealthScore,
  type AnyWealthHealthSubScore,
} from "./wealth-health-scoring";

const SCORE_TTL_S = 60 * 60 * 6; // 6h — same bound as RiskEngineService, for the same reason (this fans out across nearly every other module)
const CACHE_KEY_PREFIX = "wealth-health:";

interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
}

export interface WealthHealthScore {
  overallScore: number | null;
  subScores: AnyWealthHealthSubScore[];
  computedAt: string;
  cached: boolean;
}

interface AllocationReport {
  overallDiversificationScore?: number;
}

/**
 * Orchestrates the Phase 20 Wealth Health Score: gathers inputs from Phase
 * 11 (diversification), Phase 12 (risk), Phase 10 (income/expenses), Phase
 * 15 (tax harvesting), Phase 13 (goals), and the Phase 3 INSURANCE asset
 * bucket, then delegates every actual score calculation to the pure
 * functions in wealth-health-scoring.ts. This service owns NO scoring math
 * itself — same data-assembly-vs-calculation split as RiskEngineService.
 *
 * The full methodology (every weight, every threshold, and the reasoning
 * behind each) is documented in WEALTH_HEALTH_METHODOLOGY.md at the repo
 * root.
 */
@Injectable()
export class WealthHealthService implements OnModuleInit {
  private readonly logger = new Logger(WealthHealthService.name);
  private cache!: CacheAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly memoryCache: MemoryCacheService,
    private readonly netWorth: NetWorthService,
    private readonly analytics: AnalyticsService,
    private readonly riskEngine: RiskEngineService,
    private readonly income: IncomeService,
    private readonly transactions: TransactionsService,
    private readonly harvesting: HarvestingService,
    private readonly goals: GoalsService,
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
        this.logger.log("✓ Redis connected — using Redis wealth-health cache");
        return;
      } catch {
        redis.disconnect(false);
      }
    } catch { /* ioredis import error */ }
    this.logger.warn("Redis unavailable — wealth health scores cached in-memory only.");
    this.cache = {
      get: (key) => Promise.resolve(this.memoryCache.get(key)),
      set: (key, value, ttl) => { this.memoryCache.set(key, value, ttl); return Promise.resolve(); },
    };
  }

  /** Full Wealth Health Score — cached 6h, and writes today's WealthHealthSnapshot on every fresh computation. */
  async getScore(userId: string, countryCode = "US", forceRefresh = false): Promise<WealthHealthScore> {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    if (!forceRefresh) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return { ...(JSON.parse(cached) as Omit<WealthHealthScore, "cached">), cached: true };
    }

    const subScores = await this.computeSubScores(userId, countryCode);
    const overallScore = overallWealthHealthScore(subScores);
    const result: WealthHealthScore = { overallScore, subScores, computedAt: new Date().toISOString(), cached: false };

    await this.cache.set(cacheKey, JSON.stringify({ overallScore, subScores, computedAt: result.computedAt }), SCORE_TTL_S);
    if (overallScore !== null) await this.writeSnapshot(userId, overallScore, subScores);
    return result;
  }

  // ─── Data assembly ────────────────────────────────────────────────────────

  private async computeSubScores(userId: string, countryCode: string): Promise<AnyWealthHealthSubScore[]> {
    const [netWorthResult, allocationRaw, riskProfile, monthlyIncomeResult, avgMonthlyExpense, harvestCandidates, activeGoals] =
      await Promise.all([
        this.netWorth.calculateNetWorth(userId),
        this.analytics.getAllocation(userId),
        this.riskEngine.getRiskProfile(userId),
        this.income.getMonthlyPassiveIncome(userId),
        this.transactions.getAverageMonthlyExpense(userId, 3),
        this.harvesting.getHarvestCandidates(userId, countryCode).catch((err: unknown) => {
          this.logger.warn(`Harvest-candidate scan failed while computing Wealth Health Score for ${userId}: ${String(err)}`);
          return [] as Awaited<ReturnType<HarvestingService["getHarvestCandidates"]>>;
        }),
        this.goals.findAll(userId),
      ]);

    const allocation = allocationRaw as AllocationReport;
    const totalAssets = netWorthResult.totalAssets.toNumber();
    const monthlyIncome = monthlyIncomeResult.monthlyAmount;
    const totalHarvestableLoss = harvestCandidates.reduce((sum, c) => sum + Math.abs(c.unrealizedLoss), 0);
    const insuranceValue = netWorthResult.assetAllocation.find((a) => a.category === "INSURANCE")?.valueInBase ?? 0;

    return [
      diversificationHealth({ overallDiversificationScore: allocation.overallDiversificationScore ?? 0 }),
      riskCompositeHealth({ overallRiskScore: riskProfile.overallScore }),
      savingsRateHealth({ monthlyIncome, avgMonthlyExpense }),
      taxEfficiencyHealth({ totalHarvestableLoss, totalAssets }),
      goalProgressHealth({ goalPercentCompletes: activeGoals.map((g) => g.percentComplete) }),
      insuranceAdequacyHealth({ insuranceValue, annualIncome: monthlyIncome * 12 }),
    ];
  }

  private async writeSnapshot(userId: string, overallScore: number, subScores: AnyWealthHealthSubScore[]): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
      await this.prisma.wealthHealthSnapshot.upsert({
        where: { userId_snapshotDate: { userId, snapshotDate: today } },
        create: { userId, overallScore, subScores: subScores as unknown as object, snapshotDate: today },
        update: { overallScore, subScores: subScores as unknown as object },
      });
    } catch (err) {
      this.logger.error(`Failed to write wealth-health snapshot for ${userId}`, err);
    }
  }
}
