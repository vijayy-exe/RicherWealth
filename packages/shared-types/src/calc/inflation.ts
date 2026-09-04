/**
 * Inflation-adjustment math — pure functions, no DI, no I/O. Backs the
 * standalone Inflation calculator, and reused by retirement.ts for
 * projecting future living costs.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** What a cost of `currentCost` today will cost in `years`, at `inflationPct` annual inflation. */
export function futureCost(currentCost: number, inflationPct: number, years: number): number {
  return round2(currentCost * Math.pow(1 + inflationPct / 100, years));
}

/** What a future cost of `futureAmount` (in `years`) is worth in today's money, at `inflationPct` annual inflation. */
export function presentValueOfFutureCost(futureAmount: number, inflationPct: number, years: number): number {
  return round2(futureAmount / Math.pow(1 + inflationPct / 100, years));
}

/**
 * Fisher equation: the "real" (inflation-adjusted) rate of return implied by
 * a nominal annual return and an annual inflation rate, both in percent.
 * realRate = (1+nominal)/(1+inflation) - 1, expressed back in percent.
 */
export function realRateOfReturn(nominalRatePct: number, inflationPct: number): number {
  const real = (1 + nominalRatePct / 100) / (1 + inflationPct / 100) - 1;
  return Math.round(real * 100 * 10_000) / 10_000; // 4 decimal places, percent
}
