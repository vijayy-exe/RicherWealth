/**
 * SWP (Systematic Withdrawal Plan) — deterministic month-by-month corpus
 * depletion simulation. Pure, no DI, shared between apps/web and apps/api.
 *
 * Deliberately deterministic (a fixed expected annual return), unlike the
 * Phase 11/13 goal Monte Carlo simulation — an SWP calculator answers "how
 * long will my money last at this withdrawal rate, assuming steady growth,"
 * a different question from "what's my probability of success given market
 * volatility" (that's what Goal success-probability is for).
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface SwpInput {
  initialCorpus: number;
  monthlyWithdrawal: number;
  annualRatePct: number;
  /** Cap on months simulated, guaranteeing termination when withdrawals are smaller than growth (corpus never depletes). Default 600 (50 years). */
  maxMonths?: number;
}

export interface SwpMonth {
  month: number;
  growth: number;
  withdrawal: number;
  remainingCorpus: number;
}

export interface SwpResult {
  schedule: SwpMonth[];
  monthsLasted: number;
  /** True if the corpus was fully depleted within maxMonths; false if it's still growing/sustaining indefinitely. */
  corpusExhausted: boolean;
  totalWithdrawn: number;
  finalCorpus: number;
}

/**
 * Each month: corpus grows at the monthly-equivalent rate, then the
 * withdrawal is deducted. Stops early if the corpus is depleted, or after
 * `maxMonths` if withdrawals are smaller than growth (a perpetually
 * sustainable SWP — reported as `corpusExhausted: false`).
 */
export function simulateSwp(input: SwpInput): SwpResult {
  const { initialCorpus, monthlyWithdrawal, annualRatePct, maxMonths = 600 } = input;
  const i = annualRatePct / 100 / 12;

  const schedule: SwpMonth[] = [];
  let corpus = round2(initialCorpus);
  let totalWithdrawn = 0;
  let month = 0;
  let exhausted = false;

  while (month < maxMonths) {
    month += 1;
    const growth = round2(corpus * i);
    corpus = round2(corpus + growth);

    const withdrawal = Math.min(monthlyWithdrawal, corpus);
    corpus = round2(corpus - withdrawal);
    totalWithdrawn = round2(totalWithdrawn + withdrawal);

    schedule.push({ month, growth, withdrawal, remainingCorpus: corpus });

    if (corpus <= 0.005) {
      exhausted = true;
      break;
    }
  }

  return {
    schedule,
    monthsLasted: schedule.length,
    corpusExhausted: exhausted,
    totalWithdrawn,
    finalCorpus: corpus,
  };
}
