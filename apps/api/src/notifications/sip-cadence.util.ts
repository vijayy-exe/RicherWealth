/**
 * Infers a SIP's expected next installment date from its own installment
 * history — there is no stored cadence/schedule anywhere in the schema
 * (SipInstallment only records what already happened). With fewer than 2
 * installments there's no gap to measure, so this deliberately returns
 * `null` (skip) rather than guessing a default monthly cadence — a fund
 * with one lumpsum-then-SIP-started installment shouldn't be alerted on
 * a fabricated schedule.
 */
export interface SipCadenceResult {
  /** Median gap (days) between the installments used, rounded. */
  inferredCadenceDays: number;
  lastInstallmentDate: Date;
  expectedNextDate: Date;
}

export function inferSipCadence(installmentDatesDesc: Date[]): SipCadenceResult | null {
  if (installmentDatesDesc.length < 2) return null;

  // Use up to the 3 most recent gaps for a slightly more robust estimate
  // than a single gap, but don't require more history than exists.
  const recent = installmentDatesDesc.slice(0, 4);
  const gaps: number[] = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const days = Math.round((recent[i]!.getTime() - recent[i + 1]!.getTime()) / (1000 * 60 * 60 * 24));
    if (days > 0) gaps.push(days);
  }
  if (gaps.length === 0) return null;

  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;

  const lastInstallmentDate = recent[0]!;
  const expectedNextDate = new Date(lastInstallmentDate.getTime() + median * 24 * 60 * 60 * 1000);

  return { inferredCadenceDays: median, lastInstallmentDate, expectedNextDate };
}

/** Is the inferred next date within the "approaching" window (0-3 days out, not yet overdue by more than 1 day)? */
export function isSipApproaching(cadence: SipCadenceResult, now: Date = new Date()): boolean {
  const daysUntil = Math.floor((cadence.expectedNextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntil >= -1 && daysUntil <= 3;
}
