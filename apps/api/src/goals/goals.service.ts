import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { QuantClientService } from "../analytics/quant-client.service";
import type { CreateGoalDto, UpdateGoalDto } from "./dto/goal.dto";
import type { Goal } from "@prisma/client";
import Decimal from "decimal.js";
import { requiredSipForTarget } from "@richer/shared-types";

export interface GoalWithProgress extends Goal {
  currentProgress: number;
  percentComplete: number;
}

export interface GoalSuccessProbability {
  monthsRemaining: number;
  requiredMonthlyContribution: number;
  contributionUsed: number;
  probabilityOfTarget: number;
  isAssumedReturn: boolean;
  assumedAnnualReturnPct: number;
  assumedAnnualVolatilityPct: number;
  alreadyAchieved?: true;
}

export interface GoalSuccessProbabilityError {
  error: true;
  reason: string;
}

@Injectable()
export class GoalsService {
  private readonly logger = new Logger(GoalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly currency: CurrencyService,
    private readonly analytics: AnalyticsService,
    private readonly quant: QuantClientService,
  ) {}

  async findAll(userId: string): Promise<GoalWithProgress[]> {
    const goals = await this.prisma.goal.findMany({
      where: { userId, deletedAt: null },
      orderBy: { targetDate: "asc" },
    });
    return Promise.all(goals.map((g) => this.attachProgress(g)));
  }

  async findOne(userId: string, id: string): Promise<GoalWithProgress> {
    const goal = await this.getOwnedGoal(userId, id);
    return this.attachProgress(goal);
  }

  async create(userId: string, dto: CreateGoalDto): Promise<GoalWithProgress> {
    const goal = await this.prisma.goal.create({
      data: {
        userId,
        type: dto.type as Goal["type"],
        name: dto.name,
        targetAmount: dto.targetAmount.toString(),
        targetDate: new Date(dto.targetDate),
        currencyCode: dto.currencyCode,
        linkedAssetIds: dto.linkedAssetIds ?? [],
        standaloneProgressAmount: (dto.standaloneProgressAmount ?? 0).toString(),
        notes: dto.notes ?? null,
      },
    });
    this.logger.log(`Goal created: ${goal.id} (${goal.type}) for user ${userId}`);
    return this.attachProgress(goal);
  }

  async update(userId: string, id: string, dto: UpdateGoalDto): Promise<GoalWithProgress> {
    await this.getOwnedGoal(userId, id);
    const goal = await this.prisma.goal.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type as Goal["type"] }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.targetAmount !== undefined && { targetAmount: dto.targetAmount.toString() }),
        ...(dto.targetDate !== undefined && { targetDate: new Date(dto.targetDate) }),
        ...(dto.currencyCode !== undefined && { currencyCode: dto.currencyCode }),
        ...(dto.linkedAssetIds !== undefined && { linkedAssetIds: dto.linkedAssetIds }),
        ...(dto.standaloneProgressAmount !== undefined && { standaloneProgressAmount: dto.standaloneProgressAmount.toString() }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    return this.attachProgress(goal);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwnedGoal(userId, id);
    await this.prisma.goal.update({ where: { id }, data: { deletedAt: new Date() } });
    this.logger.log(`Goal soft-deleted: ${id}`);
  }

  // ─── Success probability (Phase 13 — reuses the Phase 11 Monte Carlo engine) ─

  /**
   * Runs a REAL Monte Carlo simulation (not a placeholder percentage) of
   * the goal's outcome: the goal's currently-required monthly contribution
   * (or a caller-supplied what-if override) is simulated forward at the
   * goal's own expected return/volatility, and the reported probability is
   * the fraction of simulated paths that clear the target by the target
   * date — capturing the real risk that even a mathematically "on track"
   * contribution can miss the target due to return variance.
   */
  async getSuccessProbability(
    userId: string,
    id: string,
    monthlyContributionOverride?: number,
  ): Promise<GoalSuccessProbability | GoalSuccessProbabilityError> {
    const goal = await this.getOwnedGoal(userId, id);
    const currentProgress = await this.computeProgress(goal);
    const targetAmount = new Decimal(goal.targetAmount.toString()).toNumber();

    if (currentProgress >= targetAmount) {
      return {
        monthsRemaining: 0,
        requiredMonthlyContribution: 0,
        contributionUsed: monthlyContributionOverride ?? 0,
        probabilityOfTarget: 1,
        isAssumedReturn: false,
        assumedAnnualReturnPct: 0,
        assumedAnnualVolatilityPct: 0,
        alreadyAchieved: true,
      };
    }

    const monthsRemaining = this.monthsUntil(goal.targetDate);
    if (monthsRemaining <= 0) {
      return { error: true, reason: "Target date must be in the future to compute a success probability" };
    }

    const { annualReturnPct, annualVolatilityPct, isAssumedReturn } = await this.analytics.getPortfolioReturnAssumption(userId, goal.linkedAssetIds);

    const requiredMonthlyContribution = requiredSipForTarget(targetAmount, currentProgress, annualReturnPct, monthsRemaining) ?? 0;
    const contributionUsed = monthlyContributionOverride ?? requiredMonthlyContribution;

    const monthlyMu = annualReturnPct / 100 / 12; // simple division — same documented convention as RiskFreeRateService.getPeriodRate
    const monthlySigma = annualVolatilityPct / 100 / Math.sqrt(12);

    const simulation = (await this.quant.monteCarlo({
      initialValue: Math.max(currentProgress, 0.01), // quant service requires a strictly-positive initial value
      mu: monthlyMu,
      sigma: monthlySigma,
      periods: monthsRemaining,
      nSimulations: 10_000,
      dt: 1,
      seed: null,
      contributionPerPeriod: contributionUsed,
      targetValue: targetAmount,
    })) as { probabilityOfTarget: number };

    return {
      monthsRemaining,
      requiredMonthlyContribution,
      contributionUsed,
      probabilityOfTarget: simulation.probabilityOfTarget,
      isAssumedReturn,
      assumedAnnualReturnPct: annualReturnPct,
      assumedAnnualVolatilityPct: annualVolatilityPct,
    };
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  private async getOwnedGoal(userId: string, id: string): Promise<Goal> {
    const goal = await this.prisma.goal.findUnique({ where: { id } });
    if (!goal || goal.deletedAt) throw new NotFoundException("Goal not found");
    if (goal.userId !== userId) throw new ForbiddenException("Access denied");
    return goal;
  }

  private async attachProgress(goal: Goal): Promise<GoalWithProgress> {
    const currentProgress = await this.computeProgress(goal);
    const targetAmount = new Decimal(goal.targetAmount.toString()).toNumber();
    const percentComplete = targetAmount > 0 ? Math.min(100, (currentProgress / targetAmount) * 100) : 0;
    return { ...goal, currentProgress, percentComplete };
  }

  /** Sums the standalone figure plus every linked asset's currentValue, converted to the goal's currency. */
  private async computeProgress(goal: Goal): Promise<number> {
    let total = new Decimal(goal.standaloneProgressAmount.toString());

    if (goal.linkedAssetIds.length > 0) {
      const assets = await this.prisma.asset.findMany({
        where: { id: { in: goal.linkedAssetIds }, userId: goal.userId, deletedAt: null },
        select: { currentValue: true, currencyCode: true },
      });
      for (const asset of assets) {
        const converted = await this.currency.convert(new Decimal(asset.currentValue.toString()), asset.currencyCode, goal.currencyCode);
        total = total.add(converted);
      }
    }
    return total.toNumber();
  }

  private monthsUntil(targetDate: Date): number {
    const now = new Date();
    const months = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
    // Round down a partial final month rather than up — never claims more time than truly remains.
    return targetDate.getDate() < now.getDate() ? months - 1 : months;
  }
}
