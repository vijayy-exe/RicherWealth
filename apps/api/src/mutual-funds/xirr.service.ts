import { Injectable } from "@nestjs/common";

export interface CashFlow {
  /** Positive = inflow (redemption), Negative = outflow (investment/SIP) */
  amount: number;
  date: Date;
}

/**
 * Newton-Raphson XIRR calculator.
 *
 * XIRR solves for the rate `r` such that:
 *   Σ  CF_i / (1 + r)^(d_i / 365)  =  0
 *
 * where d_i is the number of days from the first cash-flow date to cash-flow i,
 * and the day-count convention is ACT/365.
 *
 * The function will be exported globally for reuse in SWP / goal calculators.
 *
 * @example
 * // 12 monthly SIPs of ₹10 000 then redemption of ₹1,30,000
 * const xirr = computeXirr([
 *   { amount: -10000, date: new Date("2024-01-01") },
 *   ...
 *   { amount: 130000, date: new Date("2025-01-01") },
 * ]); // ≈ 0.089 (8.9% p.a.)
 */
@Injectable()
export class XirrService {
  /**
   * Compute XIRR for a series of cash flows.
   *
   * @param cashFlows  Array of { amount, date } — must contain at least one
   *                   negative AND one positive value for XIRR to be defined.
   * @returns          Annual rate as a decimal (e.g. 0.089 = 8.9%) or null if
   *                   convergence fails / inputs are degenerate.
   */
  computeXirr(cashFlows: CashFlow[]): number | null {
    return computeXirr(cashFlows);
  }
}

// ─── Pure function (exported for unit tests) ───────────────────────────────────

const MAX_ITERATIONS = 200;
const TOLERANCE = 1e-8;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Pure Newton-Raphson XIRR — exported directly for unit-testing without DI.
 */
export function computeXirr(cashFlows: CashFlow[]): number | null {
  if (!cashFlows || cashFlows.length < 2) return null;

  // Validate: must have at least one positive and one negative cash flow
  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  const hasNegative = cashFlows.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  // Sort by date ascending
  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length === 0) return null;

  const firstFlow = sorted[0];
  if (!firstFlow) return null;
  const t0 = firstFlow.date.getTime();

  // Days from first cash-flow to each subsequent cash-flow
  const days = sorted.map((cf) => (cf.date.getTime() - t0) / MS_PER_DAY);
  const amounts = sorted.map((cf) => cf.amount);

  // NPV at rate r:  Σ CF_i / (1+r)^(d_i/365)
  const npv = (r: number): number =>
    amounts.reduce((sum: number, cf: number, i: number) => sum + cf / Math.pow(1 + r, (days[i] ?? 0) / 365), 0);

  // Derivative of NPV with respect to r (for Newton-Raphson step)
  const dnpv = (r: number): number =>
    amounts.reduce(
      (sum: number, cf: number, i: number) =>
        sum - (cf * ((days[i] ?? 0) / 365)) / Math.pow(1 + r, (days[i] ?? 0) / 365 + 1),
      0,
    );

  // Initial guess: 0.1 (10%)
  let rate = 0.1;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const f = npv(rate);
    const df = dnpv(rate);

    if (Math.abs(df) < 1e-14) break; // derivative too small — stuck

    const newRate = rate - f / df;

    if (Math.abs(newRate - rate) < TOLERANCE) {
      return newRate; // converged
    }

    rate = newRate;

    // Clamp to avoid divergence into nonsensical territory
    if (rate <= -1) rate = -0.9999;
    if (rate > 100) rate = 100;
  }

  // Try a second pass with a different initial guess if the first didn't converge
  rate = 0.5;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-14) break;
    const newRate = rate - f / df;
    if (Math.abs(newRate - rate) < TOLERANCE) return newRate;
    rate = newRate;
    if (rate <= -1) rate = -0.9999;
    if (rate > 100) rate = 100;
  }

  return null; // did not converge
}
