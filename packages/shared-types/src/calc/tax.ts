/**
 * Basic progressive income-tax calculator — pure, no DI, no I/O.
 *
 * Deliberately "basic": a generic slab-based (marginal-bracket) engine plus
 * one illustrative default slab table. It does NOT model cess/surcharge,
 * standard deductions, rebates (e.g. India's Section 87A), filing status,
 * or any country's exact current-year rules — this is a simplified
 * estimate for financial planning, not tax advice. `calculateSlabTax` is
 * fully generic so a caller can pass any country's/year's slabs.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface TaxSlab {
  /** Upper bound of this slab (in the same currency as income), or null for "and above" (the top slab). */
  upTo: number | null;
  ratePct: number;
}

export interface TaxBracketBreakdown {
  from: number;
  to: number | null;
  ratePct: number;
  taxInBracket: number;
}

export interface SlabTaxResult {
  totalTax: number;
  effectiveRatePct: number;
  netIncome: number;
  breakdown: TaxBracketBreakdown[];
}

/**
 * Illustrative default slabs — India's "new regime" structure (FY 2024-25
 * shape, ₹ lakh boundaries), included only as a sensible out-of-the-box
 * default so the calculator isn't blank on first load. NOT guaranteed to
 * match the current year's actual notified slabs — callers should treat
 * this as a placeholder to edit, not an authoritative source.
 */
export const DEFAULT_INDIA_SLABS: TaxSlab[] = [
  { upTo: 300_000, ratePct: 0 },
  { upTo: 600_000, ratePct: 5 },
  { upTo: 900_000, ratePct: 10 },
  { upTo: 1_200_000, ratePct: 15 },
  { upTo: 1_500_000, ratePct: 20 },
  { upTo: null, ratePct: 30 },
];

/**
 * Standard marginal-bracket tax calculation: each slice of income is taxed
 * only at its own bracket's rate (never the whole income at the top
 * marginal rate). Slabs must be sorted ascending by `upTo`, with exactly
 * one `upTo: null` entry as the final (top) bracket.
 */
export function calculateSlabTax(income: number, slabs: TaxSlab[]): SlabTaxResult {
  const breakdown: TaxBracketBreakdown[] = [];
  let totalTax = 0;
  let lowerBound = 0;

  for (const slab of slabs) {
    if (income <= lowerBound) break;
    const upperBound = slab.upTo === null ? income : Math.min(slab.upTo, income);
    const amountInBracket = Math.max(0, upperBound - lowerBound);
    const taxInBracket = round2(amountInBracket * (slab.ratePct / 100));

    if (amountInBracket > 0) {
      // `to` reflects the actual upper edge of income taxed in this bracket
      // (which may be less than the slab's own boundary, if income doesn't
      // reach it) — not the slab definition's nominal boundary.
      breakdown.push({ from: lowerBound, to: upperBound, ratePct: slab.ratePct, taxInBracket });
      totalTax = round2(totalTax + taxInBracket);
    }

    if (slab.upTo === null || slab.upTo >= income) break;
    lowerBound = slab.upTo;
  }

  const effectiveRatePct = income > 0 ? round2((totalTax / income) * 100) : 0;
  return { totalTax, effectiveRatePct, netIncome: round2(income - totalTax), breakdown };
}
