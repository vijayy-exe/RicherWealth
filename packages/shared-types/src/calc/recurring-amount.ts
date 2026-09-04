/**
 * Convert a recurring amount at any frequency to its monthly or annual
 * equivalent — used to roll individual Income entries into the dashboard's
 * monthly-passive-income figure. Pure, no DI, shared between apps/api
 * (the source of truth for the dashboard figure) and apps/web (a live
 * preview on the income form as the user types).
 */

export type RecurringFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "ONE_TIME";

const PERIODS_PER_YEAR: Record<Exclude<RecurringFrequency, "ONE_TIME">, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
};

/** Monthly-equivalent amount. ONE_TIME entries return 0 — they don't recur. */
export function toMonthlyAmount(amount: number, frequency: RecurringFrequency): number {
  if (frequency === "ONE_TIME") return 0;
  return (amount * PERIODS_PER_YEAR[frequency]) / 12;
}

/** Annual-equivalent amount. ONE_TIME entries return the amount itself (it happens once, within the year it's dated). */
export function toAnnualAmount(amount: number, frequency: RecurringFrequency): number {
  if (frequency === "ONE_TIME") return amount;
  return amount * PERIODS_PER_YEAR[frequency];
}
