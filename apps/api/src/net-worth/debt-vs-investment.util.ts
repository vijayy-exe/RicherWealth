/**
 * Phase 20 — extracted verbatim from DashboardResolver.dashboardSummary
 * (which anticipated this exact feature — see its own Phase 9 comment in
 * dashboard.types.ts), so the Dashboard's on-screen figure and the AI CFO's
 * "your debt costs more than your investments earn" suggestion can NEVER
 * silently drift apart: both now call this one pure function instead of
 * each computing their own copy.
 */

export interface DebtVsInvestmentInputs {
  /** LiabilitiesService.getPortfolioSummary(userId)?.weightedInterestRate ?? 0 */
  debtCostPct: number;
  /** LiabilitiesService.getPortfolioSummary(userId)?.totalOutstanding ?? 0 */
  totalOutstanding: number;
  /** NetWorthService.getAssetGrowthRate(userId, 365).pctChange */
  investmentReturnPct: number;
}

export interface DebtVsInvestmentResult {
  debtCostPct: number;
  totalOutstanding: number;
  investmentReturnPct: number;
  annualInterestCost: number;
  debtCostExceedsInvestmentReturns: boolean;
}

export function computeDebtVsInvestment(inputs: DebtVsInvestmentInputs): DebtVsInvestmentResult {
  const { debtCostPct, totalOutstanding, investmentReturnPct } = inputs;
  return {
    debtCostPct,
    totalOutstanding,
    investmentReturnPct,
    annualInterestCost: totalOutstanding * (debtCostPct / 100),
    debtCostExceedsInvestmentReturns: totalOutstanding > 0 && debtCostPct > investmentReturnPct,
  };
}
