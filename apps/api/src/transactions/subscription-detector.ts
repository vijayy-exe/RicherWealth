/**
 * Subscription detector — flags recurring same-merchant/same-amount
 * transactions. Pure function, no DB access: takes whatever transaction
 * rows the caller already fetched and groups them.
 */

export interface SubscriptionCandidateInput {
  id: string;
  merchant: string | null;
  amount: number;
  currencyCode: string;
  date: Date;
}

export type EstimatedFrequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "IRREGULAR";

export interface SubscriptionCandidate {
  merchant: string;
  amount: number;
  currencyCode: string;
  occurrences: number;
  firstDate: Date;
  lastDate: Date;
  averageIntervalDays: number;
  estimatedFrequency: EstimatedFrequency;
  transactionIds: string[];
}

export interface DetectSubscriptionsOptions {
  /** Minimum occurrences of the same merchant+amount to consider at all. Default 2. */
  minOccurrences?: number;
  /** +/- days tolerance around a known billing cycle before it's classified IRREGULAR. Default 5. */
  toleranceDays?: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// [label, nominal day count, requires at least this many occurrences to
// trust a 2-sample average — weekly/monthly cycles are common enough to
// flag off just 2 charges, quarterly/annual need a 3rd data point since a
// ~90 or ~365 day gap is also what two totally unrelated purchases would
// show by chance].
const KNOWN_CYCLES: Array<{ frequency: EstimatedFrequency; days: number; minOccurrencesToTrust: number }> = [
  { frequency: "WEEKLY", days: 7, minOccurrencesToTrust: 2 },
  { frequency: "MONTHLY", days: 30, minOccurrencesToTrust: 2 },
  { frequency: "QUARTERLY", days: 91, minOccurrencesToTrust: 3 },
  { frequency: "ANNUALLY", days: 365, minOccurrencesToTrust: 3 },
];

function groupKey(merchant: string, amount: number, currencyCode: string): string {
  return `${merchant.toLowerCase().trim()}|${amount.toFixed(2)}|${currencyCode}`;
}

export function detectSubscriptions(
  transactions: SubscriptionCandidateInput[],
  options: DetectSubscriptionsOptions = {},
): SubscriptionCandidate[] {
  const { minOccurrences = 2, toleranceDays = 5 } = options;

  const groups = new Map<string, SubscriptionCandidateInput[]>();
  for (const t of transactions) {
    if (!t.merchant) continue;
    const key = groupKey(t.merchant, t.amount, t.currencyCode);
    const existing = groups.get(key);
    if (existing) existing.push(t);
    else groups.set(key, [t]);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const rows of groups.values()) {
    if (rows.length < minOccurrences) continue;

    const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (!prev || !curr) continue;
      gaps.push((curr.date.getTime() - prev.date.getTime()) / MS_PER_DAY);
    }
    const averageIntervalDays = gaps.length > 0 ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;

    let estimatedFrequency: EstimatedFrequency = "IRREGULAR";
    for (const cycle of KNOWN_CYCLES) {
      const withinTolerance = Math.abs(averageIntervalDays - cycle.days) <= toleranceDays;
      const enoughEvidence = sorted.length >= cycle.minOccurrencesToTrust;
      if (withinTolerance && enoughEvidence) {
        estimatedFrequency = cycle.frequency;
        break;
      }
    }

    // Require at least a recognized cycle OR 3+ occurrences before flagging
    // — two same-amount purchases with an odd gap is coincidence, not a subscription.
    if (estimatedFrequency === "IRREGULAR" && sorted.length < 3) continue;

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) continue;

    candidates.push({
      merchant: first.merchant ?? "",
      amount: first.amount,
      currencyCode: first.currencyCode,
      occurrences: sorted.length,
      firstDate: first.date,
      lastDate: last.date,
      averageIntervalDays: Math.round(averageIntervalDays),
      estimatedFrequency,
      transactionIds: sorted.map((t) => t.id),
    });
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}
