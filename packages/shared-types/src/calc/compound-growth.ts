/**
 * Compound-growth engine — pure functions, no DI, no I/O. Shared between
 * apps/web (instant live-updating calculator previews as the user types)
 * and apps/api (authoritative calculation when a calculator result is saved
 * as a Goal) — both import this exact compiled function, so their outputs
 * cannot drift for the same inputs.
 *
 * Backs four of Phase 13's calculators that are all, mathematically, the
 * same lumpsum-compounding formula with different conventional defaults —
 * rather than reimplementing it four times:
 *   - Compound Interest: `compoundGrowth(principal, rate, years, 1)` (or any n)
 *   - Lumpsum (mutual fund):  `compoundGrowth(principal, rate, years, 1)`
 *   - FD (Fixed Deposit):     `compoundGrowth(principal, rate, years, 4)` (quarterly, the standard bank FD convention)
 * and the SIP/RD engine below backs SIP and RD (a recurring deposit is,
 * mathematically, a fixed-monthly-contribution annuity — the same formula —
 * the difference is RD's rate is bank-guaranteed/fixed rather than
 * market-linked, a UI/labeling distinction, not a math one).
 */

// ─── Lumpsum compounding (Compound Interest / Lumpsum / FD) ────────────────

export interface CompoundGrowthInput {
  principal: number;
  annualRatePct: number;
  years: number;
  /** Compounding periods per year. 1 = annual, 4 = quarterly (FD default), 12 = monthly. */
  compoundingPerYear?: number;
}

export interface CompoundGrowthPoint {
  year: number;
  value: number;
  interestEarned: number;
}

export interface CompoundGrowthResult {
  futureValue: number;
  totalInterest: number;
  /** One point per year (year 0 = principal), for a growth-curve chart. */
  yearlySchedule: CompoundGrowthPoint[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * FV = P * (1 + r/n)^(n*t) — standard compound-interest formula.
 */
export function compoundGrowth(input: CompoundGrowthInput): CompoundGrowthResult {
  const { principal, annualRatePct, years, compoundingPerYear = 1 } = input;
  const n = compoundingPerYear;
  const r = annualRatePct / 100;

  const yearlySchedule: CompoundGrowthPoint[] = [];
  for (let year = 0; year <= Math.ceil(years); year++) {
    const t = Math.min(year, years);
    const value = round2(principal * Math.pow(1 + r / n, n * t));
    yearlySchedule.push({ year, value, interestEarned: round2(value - principal) });
  }

  const futureValue = round2(principal * Math.pow(1 + r / n, n * years));
  return { futureValue, totalInterest: round2(futureValue - principal), yearlySchedule };
}

// ─── SIP / RD (fixed periodic contribution, annuity-due) ───────────────────

export interface SipGrowthInput {
  monthlyContribution: number;
  annualRatePct: number;
  months: number;
}

export interface SipGrowthPoint {
  month: number;
  invested: number;
  value: number;
}

export interface SipGrowthResult {
  futureValue: number;
  totalInvested: number;
  totalGain: number;
  /** One point per month, for a growth-curve chart. */
  monthlySchedule: SipGrowthPoint[];
}

/**
 * SIP future value, annuity-DUE convention (contribution invested at the
 * START of each month, matching how an SIP auto-debit actually works —
 * money leaves the account and gets invested on the same day, before that
 * month's growth accrues): FV = P * [((1+i)^n - 1) / i] * (1+i), where i is
 * the monthly rate. When i = 0 (0% return), FV = P * n exactly.
 *
 * Also backs the RD (Recurring Deposit) calculator — same formula, deposits
 * at a bank-guaranteed fixed rate instead of a market-linked one.
 */
export function sipFutureValue(input: SipGrowthInput): SipGrowthResult {
  const { monthlyContribution: P, annualRatePct, months: n } = input;
  const i = annualRatePct / 100 / 12;

  const monthlySchedule: SipGrowthPoint[] = [];
  let value = 0;
  for (let month = 1; month <= n; month++) {
    value = (value + P) * (1 + i);
    monthlySchedule.push({ month, invested: round2(P * month), value: round2(value) });
  }

  const futureValue = round2(value);
  const totalInvested = round2(P * n);
  return { futureValue, totalInvested, totalGain: round2(futureValue - totalInvested), monthlySchedule };
}

// ─── Reverse solves (Goal Planning calculator + Goal success-probability) ──

/**
 * Required monthly SIP to reach `targetAmount` in `months`, starting from
 * `currentValue` already invested, at `annualRatePct` expected annual
 * return. Solves the annuity-due future-value formula for P:
 *
 *   P = (target - current*(1+i)^n) * i / (((1+i)^n - 1) * (1+i))
 *
 * Returns 0 (not negative) if `currentValue` alone is already projected to
 * meet or exceed the target by growth — no further contribution is needed.
 * Returns null if `months` <= 0 (target date isn't in the future).
 */
export function requiredSipForTarget(targetAmount: number, currentValue: number, annualRatePct: number, months: number): number | null {
  if (months <= 0) return null;
  const i = annualRatePct / 100 / 12;
  const growthOfCurrent = currentValue * Math.pow(1 + i, months);
  const remaining = targetAmount - growthOfCurrent;
  if (remaining <= 0) return 0;

  if (i === 0) return round2(remaining / months);
  const annuityFactor = ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
  return round2(remaining / annuityFactor);
}

/**
 * Required lumpsum today to reach `targetAmount` in `years` at
 * `annualRatePct`: the inverse of `compoundGrowth`'s FV formula,
 * PV = target / (1 + r)^t. Returns null if `years` <= 0.
 */
export function requiredLumpsumForTarget(targetAmount: number, annualRatePct: number, years: number): number | null {
  if (years <= 0) return null;
  const r = annualRatePct / 100;
  return round2(targetAmount / Math.pow(1 + r, years));
}
