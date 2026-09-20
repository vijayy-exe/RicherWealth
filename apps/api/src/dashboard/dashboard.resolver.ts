import { Resolver, Query, Context } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";

import { DashboardSummaryType } from "./dto/dashboard.types";
import { NetWorthService } from "../net-worth/net-worth.service";
import { LiabilitiesService } from "../liabilities/liabilities.service";
import { IncomeService } from "../income/income.service";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import type { UserWithRelations } from "../auth/auth.service";
import { computeDebtVsInvestment } from "../net-worth/debt-vs-investment.util";

interface GqlContext {
  req: { user: UserWithRelations };
}

@Resolver()
export class DashboardResolver {
  constructor(
    private readonly netWorthService: NetWorthService,
    private readonly liabilitiesService: LiabilitiesService,
    private readonly incomeService: IncomeService,
  ) {}

  @Query(() => DashboardSummaryType, { description: "Full dashboard summary for the current user" })
  @UseGuards(SupabaseAuthGuard)
  async dashboardSummary(@Context() ctx: GqlContext): Promise<DashboardSummaryType> {
    const userId = ctx.req.user.id;

    // Phase 22: computed once and shared — a k6 load test found this single
    // query being independently recomputed 5x per dashboard load (see
    // NetWorthService.getDelta's doc comment for the full account).
    const current = await this.netWorthService.calculateNetWorth(userId);

    // Fix Audit M-02: emergencyFundHealth (trailing-3-month expense average,
    // properly currency-converted fallback) is now computed once, inside
    // NetWorthService.getDashboardSummary() itself, rather than duplicated
    // here AND left as a currency-blind bare-/50000 fallback in this
    // resolver specifically -- the two had drifted out of sync (this
    // resolver's own fallback was never fixed for currency, even after
    // Phase 10 added the trailing-average path). Single source of truth now;
    // every other caller of getDashboardSummary() (AI reports, RAG indexing,
    // PDF reports) gets the same correct value this resolver does, not just
    // whichever caller happened to duplicate the override logic.
    const [summary, liabilitiesSummary, assetGrowth, monthlyPassiveIncome] = await Promise.all([
      this.netWorthService.getDashboardSummary(userId, current),
      this.liabilitiesService.getPortfolioSummary(userId),
      this.netWorthService.getAssetGrowthRate(userId, 365, current),
      this.incomeService.getMonthlyPassiveIncome(userId),
    ]);

    const debtVsInvestment = computeDebtVsInvestment({
      debtCostPct: liabilitiesSummary?.weightedInterestRate ?? 0,
      totalOutstanding: liabilitiesSummary?.totalOutstanding ?? 0,
      investmentReturnPct: assetGrowth.pctChange,
    });

    const { debtCostPct, annualInterestCost, investmentReturnPct, debtCostExceedsInvestmentReturns } = debtVsInvestment;
    return {
      ...summary,
      debtCostPct,
      annualInterestCost,
      investmentReturnPct,
      debtCostExceedsInvestmentReturns,
      monthlyPassiveIncome: monthlyPassiveIncome.monthlyAmount,
    };
  }
}
