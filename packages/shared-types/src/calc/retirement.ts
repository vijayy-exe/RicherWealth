/**
 * Retirement-corpus planning — pure functions, no DI, no I/O. Reuses
 * `requiredSipForTarget` from compound-growth.ts rather than re-deriving the
 * annuity-solve formula (the retirement calculator's "how much should I
 * invest per month" question is exactly that formula, applied to a
 * retirement-specific target and horizon).
 */

import { requiredSipForTarget } from "./compound-growth";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  /** Current monthly living expense, in today's money. */
  currentMonthlyExpense: number;
  inflationPct: number;
  /** Expected annual return BEFORE retirement (accumulation phase). */
  preRetirementReturnPct: number;
  /** Expected annual return AFTER retirement (drawdown phase, typically more conservative). */
  postRetirementReturnPct: number;
  /** Corpus already saved toward retirement, today. */
  existingCorpus?: number;
}

export interface RetirementResult {
  yearsToRetirement: number;
  yearsInRetirement: number;
  monthlyExpenseAtRetirement: number;
  /** Corpus needed AT retirement to fund `monthlyExpenseAtRetirement` (inflation-adjusted) for the rest of `lifeExpectancy`. */
  requiredCorpusAtRetirement: number;
  /** Monthly SIP needed between now and retirement to close the gap, at `preRetirementReturnPct`. Null if already retired/past due, 0 if existingCorpus's own growth already covers it. */
  requiredMonthlySip: number | null;
}

/**
 * Required corpus at retirement: the present value (at the post-retirement
 * real rate of return) of a level, inflation-adjusted monthly expense drawn
 * down over the retirement years. Because the expense itself is assumed to
 * keep growing with inflation during retirement, discounting at the REAL
 * (inflation-netted) rate turns it into a standard level annuity in real
 * terms — the standard "how big a nest egg do I need" formula.
 */
export function calculateRetirementPlan(input: RetirementInput): RetirementResult {
  const {
    currentAge, retirementAge, lifeExpectancy, currentMonthlyExpense,
    inflationPct, preRetirementReturnPct, postRetirementReturnPct, existingCorpus = 0,
  } = input;

  const yearsToRetirement = retirementAge - currentAge;
  const yearsInRetirement = Math.max(0, lifeExpectancy - retirementAge);

  const monthlyExpenseAtRetirement = round2(currentMonthlyExpense * Math.pow(1 + inflationPct / 100, yearsToRetirement));
  const annualExpenseAtRetirement = monthlyExpenseAtRetirement * 12;

  // Fisher-equation real rate — the drawdown is modeled year-by-year, so this is used directly (no monthly conversion needed).
  const realAnnualRate = (1 + postRetirementReturnPct / 100) / (1 + inflationPct / 100) - 1;

  let requiredCorpusAtRetirement: number;
  if (yearsInRetirement <= 0) {
    requiredCorpusAtRetirement = 0;
  } else if (Math.abs(realAnnualRate) < 1e-9) {
    requiredCorpusAtRetirement = round2(annualExpenseAtRetirement * yearsInRetirement);
  } else {
    // PV of an ordinary level annuity at the real rate
    requiredCorpusAtRetirement = round2(
      (annualExpenseAtRetirement * (1 - Math.pow(1 + realAnnualRate, -yearsInRetirement))) / realAnnualRate,
    );
  }

  const requiredMonthlySip = requiredSipForTarget(
    requiredCorpusAtRetirement,
    existingCorpus,
    preRetirementReturnPct,
    Math.max(0, yearsToRetirement) * 12,
  );

  return { yearsToRetirement, yearsInRetirement, monthlyExpenseAtRetirement, requiredCorpusAtRetirement, requiredMonthlySip };
}
