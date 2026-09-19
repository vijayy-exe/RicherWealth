import { Resolver, Query, Context } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";

import { DashboardSummaryType } from "./dto/dashboard.types";
import { NetWorthService } from "../net-worth/net-worth.service";
import { LiabilitiesService } from "../liabilities/liabilities.service";
import { IncomeService } from "../income/income.service";
import { TransactionsService } from "../transactions/transactions.service";
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
    private readonly transactionsService: TransactionsService,
  ) {}

  @Query(() => DashboardSummaryType, { description: "Full dashboard summary for the current user" })
  @UseGuards(SupabaseAuthGuard)
  async dashboardSummary(@Context() ctx: GqlContext): Promise<DashboardSummaryType> {
    const userId = ctx.req.user.id;

    // Phase 22: computed once and shared — a k6 load test found this single
    // query being independently recomputed 5x per dashboard load (see
    // NetWorthService.getDelta's doc comment for the full account).
    const current = await this.netWorthService.calculateNetWorth(userId);

    const [summary, liabilitiesSummary, assetGrowth, monthlyPassiveIncome, avgMonthlyExpense] = await Promise.all([
      this.netWorthService.getDashboardSummary(userId, current),
      this.liabilitiesService.getPortfolioSummary(userId),
      this.netWorthService.getAssetGrowthRate(userId, 365, current),
      this.incomeService.getMonthlyPassiveIncome(userId),
      this.transactionsService.getAverageMonthlyExpense(userId, 3),
    ]);

    const debtVsInvestment = computeDebtVsInvestment({
      debtCostPct: liabilitiesSummary?.weightedInterestRate ?? 0,
      totalOutstanding: liabilitiesSummary?.totalOutstanding ?? 0,
      investmentReturnPct: assetGrowth.pctChange,
    });

    // Phase 10: replace the Phase 2 hardcoded /50000 placeholder with a real
    // trailing-3-month expense average now that expense tracking exists.
    // Falls back to the old placeholder only when there's no expense history
    // yet (a brand-new user), so the metric never divides by zero.
    const cashValue = summary.assetAllocation.find((a) => a.category === "CASH")?.valueInBase ?? 0;
    const emergencyFundHealth =
      avgMonthlyExpense && avgMonthlyExpense > 0
        ? Math.min(cashValue / avgMonthlyExpense, 12)
        : cashValue > 0
          ? Math.min(cashValue / 50000, 12)
          : 0;

    const { debtCostPct, annualInterestCost, investmentReturnPct, debtCostExceedsInvestmentReturns } = debtVsInvestment;
    return {
      ...summary,
      emergencyFundHealth,
      debtCostPct,
      annualInterestCost,
      investmentReturnPct,
      debtCostExceedsInvestmentReturns,
      monthlyPassiveIncome: monthlyPassiveIncome.monthlyAmount,
    };
  }
}
