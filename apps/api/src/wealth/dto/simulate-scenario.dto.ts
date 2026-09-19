import { IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { Type } from "class-transformer";

export enum ScenarioTypeDto {
  MARKET_CRASH = "MARKET_CRASH",
  JOB_LOSS = "JOB_LOSS",
  INHERITANCE = "INHERITANCE",
  HOME_PURCHASE = "HOME_PURCHASE",
  EARLY_RETIREMENT = "EARLY_RETIREMENT",
  INFLATION_SPIKE = "INFLATION_SPIKE",
  CURRENCY_DEPRECIATION = "CURRENCY_DEPRECIATION",
  SALARY_CHANGE = "SALARY_CHANGE",
}

export class SimulateScenarioDto {
  @IsEnum(ScenarioTypeDto)
  scenarioType!: ScenarioTypeDto;

  /** Projection horizon. Defaults to 10 years if omitted. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  horizonYears?: number;

  /** Assumed steady monthly contribution/SIP BOTH the baseline and scenario
   * runs use, except where the scenario itself changes it (JOB_LOSS,
   * EARLY_RETIREMENT, SALARY_CHANGE). Defaults to 0 (lump-sum-only projection). */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  monthlyContribution?: number;

  // ─── MARKET_CRASH ─────────────────────────────────────────────────────
  /** One-time instantaneous portfolio drop, as a positive percentage (e.g. 30 for -30%). Default 30. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  marketCrashPct?: number;

  // ─── JOB_LOSS ─────────────────────────────────────────────────────────
  /** How many months the job loss lasts before contributions resume. Default 6. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  jobLossMonths?: number;

  /** Monthly amount drawn FROM the portfolio while unemployed (living expenses
   * funded out of savings instead of income) — a positive number. Defaults to
   * `monthlyContribution` (i.e. the SIP that would have gone IN instead comes OUT). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  jobLossMonthlyDrawdown?: number;

  // ─── INHERITANCE ──────────────────────────────────────────────────────
  /** One-time lump sum added to the portfolio immediately. */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  inheritanceAmount?: number;

  // ─── HOME_PURCHASE ────────────────────────────────────────────────────
  /** One-time lump sum withdrawn from the portfolio immediately (the down payment). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  homePurchaseDownPayment?: number;

  // ─── EARLY_RETIREMENT ─────────────────────────────────────────────────
  /** Months from now when contributions stop and withdrawals begin. Default: half the horizon. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  retirementStartMonth?: number;

  /** Monthly withdrawal once retired — a positive number. Defaults to `monthlyContribution`. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  retirementMonthlyWithdrawal?: number;

  // ─── INFLATION_SPIKE ──────────────────────────────────────────────────
  /** How many percentage points to cut off the annualized return for the spike's duration. Default 3. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  inflationSpikePct?: number;

  /** How many months the spike lasts. Default 12. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  inflationSpikeMonths?: number;

  // ─── CURRENCY_DEPRECIATION ────────────────────────────────────────────
  /** How much the non-base-currency holdings depreciate against the base
   * currency, as a positive percentage. Default 15. Applied only to the
   * user's real FX-exposed fraction of the portfolio (via
   * NetWorthService's currencyExposure breakdown) — NOT a true
   * multi-currency simulation, documented as approximate. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  currencyDepreciationPct?: number;

  // ─── SALARY_CHANGE ────────────────────────────────────────────────────
  /** Change to the monthly contribution, as a signed percentage (e.g. +20
   * for a raise that lets you invest 20% more, -20 for a pay cut). */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  salaryChangePct?: number;
}
