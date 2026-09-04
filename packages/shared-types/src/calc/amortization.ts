/**
 * Loan amortization engine — pure functions, no DI, no I/O.
 *
 * Shared between apps/api (persisted schedules, Decimal-precision boundary at
 * the Prisma layer) and apps/web (the loan detail page's live "what if I
 * prepay ₹X" slider computes with this same function in-browser, so the
 * slider never waits on a network round-trip and never drifts from the
 * numbers the backend would compute for the same inputs).
 *
 * Reused as-is by the EMI/Mortgage calculators in Phase 13 — that's why
 * `generateAmortizationSchedule` takes raw principal/rate/tenure/frequency
 * rather than a persisted Liability row.
 */

export type PaymentFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";

const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
};

export interface AmortizationInput {
  /** Loan principal (or, for a "what if" query, the current remaining balance). */
  principal: number;
  /** Nominal annual interest rate, percent (e.g. 8.5 = 8.5% p.a.), compounded per payment period. */
  annualRatePct: number;
  /** Loan tenure in months — always expressed in months regardless of payment frequency. */
  tenureMonths: number;
  paymentFrequency?: PaymentFrequency;
  /**
   * Extra amount paid every period on top of the scheduled payment. When > 0
   * the schedule pays off early and is shorter than the nominal tenure —
   * this is what powers the prepayment-savings calculation.
   */
  extraPaymentPerPeriod?: number;
}

export interface AmortizationScheduleEntry {
  period: number;
  payment: number;
  principalPortion: number;
  interestPortion: number;
  remainingBalance: number;
  cumulativePrincipal: number;
  cumulativeInterest: number;
  /** cumulativeInterest / cumulativePrincipal — 0 when no principal has been repaid yet. */
  interestToPrincipalRatio: number;
}

export interface AmortizationResult {
  schedule: AmortizationScheduleEntry[];
  /** The scheduled (non-extra) payment amount per period. */
  scheduledPayment: number;
  totalInterest: number;
  totalPaid: number;
  periodsPerYear: number;
  /** Nominal number of periods implied by tenureMonths (before any prepayment shortens it). */
  nominalPeriods: number;
  /** Actual number of periods in `schedule` (equals nominalPeriods unless prepaying). */
  actualPeriods: number;
}

function round2(n: number): number {
  // Standard "round half away from zero" to the cent — matches how loan
  // calculators and card issuers round each period, and avoids the
  // banker's-rounding drift that Math.round can introduce with floats.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Level-payment formula: P * r / (1 - (1+r)^-n), or P/n when the rate is 0.
 */
function computeScheduledPayment(principal: number, periodicRate: number, periods: number): number {
  if (periods <= 0) return 0;
  if (periodicRate === 0) return round2(principal / periods);
  const payment = (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -periods));
  return round2(payment);
}

/**
 * Generate a full amortization schedule. Given principal, rate, tenure, and
 * payment frequency, this produces one row per period with remaining
 * balance, interest paid to date, and interest-to-principal ratio — callers
 * needing a snapshot at an arbitrary point in time just index into
 * `schedule[period - 1]` (see `getScheduleSnapshot`).
 *
 * When `extraPaymentPerPeriod` is set, the schedule pays off early: the loop
 * stops as soon as the balance reaches zero rather than running the full
 * nominal tenure, and the final period is truncated to exactly clear the
 * remaining balance (never overpays).
 */
export function generateAmortizationSchedule(input: AmortizationInput): AmortizationResult {
  const { principal, annualRatePct, tenureMonths, paymentFrequency = "MONTHLY", extraPaymentPerPeriod = 0 } = input;

  const periodsPerYear = PERIODS_PER_YEAR[paymentFrequency];
  const nominalPeriods = Math.max(0, Math.round((tenureMonths / 12) * periodsPerYear));
  const periodicRate = annualRatePct / 100 / periodsPerYear;
  const scheduledPayment = computeScheduledPayment(principal, periodicRate, nominalPeriods);

  const schedule: AmortizationScheduleEntry[] = [];
  let balance = round2(principal);
  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;
  let period = 0;

  // Extra payments can pay off the loan well before nominalPeriods; cap the
  // loop generously above nominal in case of a very small/zero extra amount
  // rounding oddity, but a paid-off balance always terminates it first.
  const hardCap = nominalPeriods > 0 ? nominalPeriods : 1;

  while (balance > 0.005 && period < hardCap) {
    period += 1;
    const interestPortion = round2(balance * periodicRate);
    const scheduledPrincipal = scheduledPayment + extraPaymentPerPeriod - interestPortion;

    let principalPortion: number;
    let payment: number;
    if (scheduledPrincipal >= balance || period >= nominalPeriods) {
      // Final period (or an early payoff via prepayment): clear the balance exactly.
      principalPortion = balance;
      payment = round2(principalPortion + interestPortion);
    } else {
      principalPortion = round2(scheduledPrincipal);
      payment = round2(scheduledPayment + extraPaymentPerPeriod);
    }

    balance = round2(balance - principalPortion);
    cumulativePrincipal = round2(cumulativePrincipal + principalPortion);
    cumulativeInterest = round2(cumulativeInterest + interestPortion);

    schedule.push({
      period,
      payment,
      principalPortion,
      interestPortion,
      remainingBalance: Math.max(0, balance),
      cumulativePrincipal,
      cumulativeInterest,
      interestToPrincipalRatio: cumulativePrincipal > 0 ? cumulativeInterest / cumulativePrincipal : 0,
    });
  }

  const totalInterest = cumulativeInterest;
  const totalPaid = round2(cumulativePrincipal + cumulativeInterest);

  return {
    schedule,
    scheduledPayment,
    totalInterest,
    totalPaid,
    periodsPerYear,
    nominalPeriods,
    actualPeriods: schedule.length,
  };
}

/**
 * EMI calculator: the scheduled periodic payment for a loan, with no extra
 * fields — a thin, clearly-named entry point over `generateAmortizationSchedule`
 * for Phase 13's EMI calculator (same math, not a reimplementation).
 */
export function computeEmi(principal: number, annualRatePct: number, tenureMonths: number, paymentFrequency: PaymentFrequency = "MONTHLY"): number {
  return generateAmortizationSchedule({ principal, annualRatePct, tenureMonths, paymentFrequency }).scheduledPayment;
}

export interface LoanComparisonOffer {
  /** Caller-supplied label, e.g. a bank/lender name — passed through unchanged for display. */
  label: string;
  principal: number;
  annualRatePct: number;
  tenureMonths: number;
  paymentFrequency?: PaymentFrequency;
}

export interface LoanComparisonResult {
  label: string;
  scheduledPayment: number;
  totalInterest: number;
  totalPaid: number;
}

/**
 * Loan Comparison calculator: run the SAME amortization engine once per
 * offer and rank by total interest paid — the standard "which loan actually
 * costs less" comparison (a lower EMI from a longer tenure can still cost
 * more in total interest, which is exactly what this surfaces).
 */
export function compareLoans(offers: LoanComparisonOffer[]): { results: LoanComparisonResult[]; cheapestIndex: number } {
  const results = offers.map((offer): LoanComparisonResult => {
    const r = generateAmortizationSchedule(offer);
    return { label: offer.label, scheduledPayment: r.scheduledPayment, totalInterest: r.totalInterest, totalPaid: r.totalPaid };
  });
  let cheapestIndex = 0;
  for (let i = 1; i < results.length; i++) {
    if ((results[i]?.totalInterest ?? Infinity) < (results[cheapestIndex]?.totalInterest ?? Infinity)) cheapestIndex = i;
  }
  return { results, cheapestIndex };
}

/**
 * Remaining balance, interest paid to date, and interest-to-principal ratio
 * at an arbitrary point in time. `period` is 1-indexed; periods beyond the
 * end of the schedule clamp to the final (payoff) row.
 */
export function getScheduleSnapshot(
  result: Pick<AmortizationResult, "schedule">,
  period: number,
): AmortizationScheduleEntry | null {
  if (result.schedule.length === 0) return null;
  const clamped = Math.min(Math.max(1, Math.round(period)), result.schedule.length);
  return result.schedule[clamped - 1] ?? null;
}

export interface PrepaymentSavingsInput {
  principal: number;
  annualRatePct: number;
  tenureMonths: number;
  paymentFrequency?: PaymentFrequency;
  /** The hypothetical extra amount paid every period. */
  extraPaymentPerPeriod: number;
}

export interface PrepaymentSavingsResult {
  baseline: AmortizationResult;
  withPrepayment: AmortizationResult;
  interestSaved: number;
  /** How many fewer periods it takes to pay off the loan. */
  periodsReduced: number;
  /** Same, expressed in months (periodsReduced converted via periodsPerYear). */
  monthsReduced: number;
  newPayoffPeriods: number;
}

/**
 * Compare the baseline schedule against one with a hypothetical extra
 * payment every period — interest saved and tenure reduction, no AI needed.
 */
export function calculatePrepaymentSavings(input: PrepaymentSavingsInput): PrepaymentSavingsResult {
  const { extraPaymentPerPeriod, ...rest } = input;
  const baseline = generateAmortizationSchedule({ ...rest, extraPaymentPerPeriod: 0 });
  const withPrepayment = generateAmortizationSchedule({ ...rest, extraPaymentPerPeriod });

  const periodsReduced = baseline.actualPeriods - withPrepayment.actualPeriods;
  const periodsPerYear = baseline.periodsPerYear;

  return {
    baseline,
    withPrepayment,
    interestSaved: round2(baseline.totalInterest - withPrepayment.totalInterest),
    periodsReduced,
    monthsReduced: round2((periodsReduced / periodsPerYear) * 12),
    newPayoffPeriods: withPrepayment.actualPeriods,
  };
}

// ─── Credit card (revolving balance) ───────────────────────────────────────
//
// Different math from an amortized loan: there's no fixed tenure — the
// minimum payment is a function of the current balance, recalculated every
// billing cycle, and the payoff horizon depends entirely on what the
// cardholder actually pays each month.

export interface CreditCardMinPaymentInput {
  balance: number;
  /** Annual Percentage Rate, percent (e.g. 18 = 18% APR). */
  apr: number;
  /** Minimum payment as a percentage of the balance (e.g. 2 = 2%). Default 2%. */
  minPaymentPercent?: number;
  /** Flat-dollar floor on the minimum payment (e.g. 25). Default 25. */
  minPaymentFlat?: number;
}

export interface CreditCardMinPaymentResult {
  monthlyInterest: number;
  minimumPayment: number;
  principalPortion: number;
}

/**
 * Standard revolving-balance minimum-payment formula:
 *   monthlyInterest = balance * (APR / 12 / 100)
 *   minimumPayment  = max(flatMinimum, balance * minPaymentPercent%)
 *   principalPortion = max(0, minimumPayment - monthlyInterest)
 *
 * The minimum payment never exceeds balance + interest (paying off a
 * near-zero balance shouldn't overpay).
 */
export function calculateCreditCardMinimumPayment(input: CreditCardMinPaymentInput): CreditCardMinPaymentResult {
  const { balance, apr, minPaymentPercent = 2, minPaymentFlat = 25 } = input;

  const monthlyInterest = round2(balance * (apr / 100 / 12));
  const percentOfBalance = round2(balance * (minPaymentPercent / 100));
  const uncapped = Math.max(minPaymentFlat, percentOfBalance);
  const minimumPayment = round2(Math.min(uncapped, balance + monthlyInterest));
  const principalPortion = round2(Math.max(0, minimumPayment - monthlyInterest));

  return { monthlyInterest, minimumPayment, principalPortion };
}

export interface CreditCardPayoffInput extends CreditCardMinPaymentInput {
  /** Cap on months simulated, to guarantee termination for pathological inputs (e.g. minimum below interest). Default 600 (50 years). */
  maxMonths?: number;
}

export interface CreditCardPayoffMonth {
  month: number;
  payment: number;
  interestPortion: number;
  principalPortion: number;
  remainingBalance: number;
  cumulativeInterest: number;
}

export interface CreditCardPayoffResult {
  months: CreditCardPayoffMonth[];
  monthsToPayoff: number;
  totalInterestPaid: number;
  /** True if the minimum payment never exceeds accruing interest — balance never shrinks. */
  neverPaysOff: boolean;
}

/**
 * Simulate paying only the (recalculated, declining) minimum payment every
 * month until the revolving balance is cleared — the classic "minimum
 * payment trap" projection for a credit-card loan-detail view.
 */
export function projectCreditCardMinimumPayoff(input: CreditCardPayoffInput): CreditCardPayoffResult {
  const { apr, minPaymentPercent = 2, minPaymentFlat = 25, maxMonths = 600 } = input;
  let balance = round2(input.balance);

  const months: CreditCardPayoffMonth[] = [];
  let cumulativeInterest = 0;
  let month = 0;

  while (balance > 0.005 && month < maxMonths) {
    month += 1;
    const { monthlyInterest, minimumPayment, principalPortion } = calculateCreditCardMinimumPayment({
      balance,
      apr,
      minPaymentPercent,
      minPaymentFlat,
    });

    if (principalPortion <= 0) {
      // Minimum payment doesn't even cover interest — balance would never
      // shrink. Stop simulating rather than loop forever.
      break;
    }

    balance = round2(Math.max(0, balance - principalPortion));
    cumulativeInterest = round2(cumulativeInterest + monthlyInterest);

    months.push({
      month,
      payment: minimumPayment,
      interestPortion: monthlyInterest,
      principalPortion,
      remainingBalance: balance,
      cumulativeInterest,
    });
  }

  return {
    months,
    monthsToPayoff: months.length,
    totalInterestPaid: cumulativeInterest,
    neverPaysOff: balance > 0.005,
  };
}
