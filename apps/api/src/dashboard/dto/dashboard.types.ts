import { ObjectType, Field, Float } from "@nestjs/graphql";

@ObjectType()
export class AllocationItemType {
  @Field()
  category!: string;

  @Field(() => Float)
  valueInBase!: number;

  @Field(() => Float)
  percentage!: number;
}

@ObjectType()
export class CurrencyExposureItemType {
  @Field()
  currency!: string;

  @Field(() => Float)
  nativeValue!: number;

  @Field(() => Float)
  valueInBase!: number;

  @Field(() => Float)
  percentage!: number;
}

@ObjectType()
export class SnapshotPointType {
  @Field()
  date!: string;

  @Field(() => Float)
  netWorth!: number;
}

@ObjectType()
export class DashboardSummaryType {
  @Field(() => Float)
  totalNetWorth!: number;

  @Field(() => Float)
  todayChangeAbs!: number;

  @Field(() => Float)
  todayChangePct!: number;

  @Field(() => Float)
  monthChangeAbs!: number;

  @Field(() => Float)
  monthChangePct!: number;

  @Field(() => Float)
  yearChangeAbs!: number;

  @Field(() => Float)
  yearChangePct!: number;

  @Field(() => [AllocationItemType])
  assetAllocation!: AllocationItemType[];

  @Field(() => [CurrencyExposureItemType])
  currencyExposure!: CurrencyExposureItemType[];

  @Field(() => Float)
  emergencyFundHealth!: number;

  @Field(() => Float)
  debtRatio!: number;

  @Field(() => [SnapshotPointType])
  snapshots!: SnapshotPointType[];

  @Field()
  hasAssets!: boolean;

  @Field()
  baseCurrency!: string;

  // ─── Phase 9: debt cost vs. investment return (foundation for Phase 20's
  // "your debt costs more than your investments earn" AI CFO insight) ──────

  /** Weighted-average annual interest rate across all liabilities, 0 if debt-free. */
  @Field(() => Float)
  debtCostPct!: number;

  /** Approximate annual interest cost: totalOutstandingDebt × debtCostPct. */
  @Field(() => Float)
  annualInterestCost!: number;

  /** Year-over-year growth rate of total assets (independent of debt paydown). */
  @Field(() => Float)
  investmentReturnPct!: number;

  /** True when debtCostPct exceeds investmentReturnPct and the user carries debt. */
  @Field()
  debtCostExceedsInvestmentReturns!: boolean;

  // ─── Phase 10: income tracking ────────────────────────────────────────────

  /** Sum of every active recurring Income entry, monthlyized and converted to baseCurrency. */
  @Field(() => Float)
  monthlyPassiveIncome!: number;
}
