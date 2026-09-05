/**
 * Phase 15 — Tax Center shared types.
 * Used by both apps/api (service responses) and apps/web (React Query / display).
 */

// ─── Lot & Disposal DTOs (mirrors Prisma models for frontend consumption) ────

export interface TaxLotDto {
  id: string;
  holdingType: "STOCK" | "MUTUAL_FUND" | "CRYPTO";
  assetId: string | null;
  ticker: string;        // ticker / coinId / schemeCode
  displayName: string;
  quantity: number;
  remainingQuantity: number;
  costBasisPerUnit: number;
  costBasisCurrency: string;
  acquiredAt: string;    // ISO date string
  isBackfillEstimate: boolean;
  status: "OPEN" | "PARTIALLY_DISPOSED" | "CLOSED";
  createdAt: string;
}

export interface TaxLotDisposalDto {
  id: string;
  taxLotId: string;
  quantity: number;
  proceedsPerUnit: number;
  proceedsCurrency: string;
  disposedAt: string;
  holdingPeriodDays: number;
  term: "SHORT" | "LONG";
  realizedGainLoss: number;
  notes: string | null;
  createdAt: string;
}

// ─── Capital gains summary ────────────────────────────────────────────────────

export interface GainLossLine {
  taxLotId: string;
  ticker: string;
  displayName: string;
  holdingType: "STOCK" | "MUTUAL_FUND" | "CRYPTO";
  quantity: number;
  proceedsTotal: number;
  costBasisTotal: number;
  realizedGainLoss: number;
  holdingPeriodDays: number;
  disposedAt: string;
  isBackfillEstimate: boolean;
}

export interface CapitalGainsSummary {
  financialYear: string;     // e.g. "2024-25" or "2024"
  countryCode: string;
  shortTerm: {
    totalGains: number;
    totalLosses: number;
    net: number;
    lines: GainLossLine[];
    estimatedTaxAmount: number;
    estimatedRatePct: number;
  };
  longTerm: {
    totalGains: number;
    totalLosses: number;
    net: number;
    exemptionApplied: number;   // e.g. India's ₹1.25L, US's $0
    taxableGain: number;
    lines: GainLossLine[];
    estimatedTaxAmount: number;
    estimatedRatePct: number;
  };
  totalEstimatedTax: number;
  currency: string;
  hasBackfillEstimateData: boolean;
}

// ─── Dividend tax ─────────────────────────────────────────────────────────────

export interface DividendRecord {
  id: string;  // Income row id
  ticker: string;
  displayName: string;
  holdingType: "STOCK" | "MUTUAL_FUND" | "CRYPTO";
  amount: number;
  currencyCode: string;
  receivedAt: string; // ISO date
}

export interface DividendTaxSummary {
  financialYear: string;
  countryCode: string;
  totalDividendIncome: number;
  currency: string;
  estimatedWithholdingTax: number;
  estimatedRatePct: number;
  records: DividendRecord[];
}

// ─── Tax-loss harvesting ─────────────────────────────────────────────────────

export interface HarvestingCandidate {
  lot: TaxLotDto;
  currentPricePerUnit: number;
  currentValue: number;
  costBasisTotal: number;
  unrealizedLoss: number;          // always negative (it's a loss candidate)
  unrealizedLossPct: number;
  offsettableRealizedGain: number; // how much realized gain this year it offsets
  netBenefit: number;              // estimated tax saved = abs(unrealizedLoss) * rate
  estimatedTaxSaving: number;
  potentialWashSale: boolean;      // true if re-buy within 30 days detected (US)
  washSaleWarning: string | null;
  isPriceStale: boolean;
}

// ─── Full tax report (CSV / download) ────────────────────────────────────────

export interface TaxReport {
  generatedAt: string;
  financialYear: string;
  countryCode: string;
  countryName: string;
  currency: string;
  capitalGains: CapitalGainsSummary;
  dividends: DividendTaxSummary;
  totalEstimatedTax: number;
  notes: string[];
  hasBackfillEstimateData: boolean;
}

// ─── Financial year helpers ───────────────────────────────────────────────────

/**
 * Parse a financial year string into UTC start/end Date boundaries.
 * Supports two formats:
 *   - "2024"      → Jan 1, 2024 00:00 UTC … Dec 31, 2024 23:59:59 UTC  (calendar year, US)
 *   - "2024-25"   → Apr 1, 2024 00:00 UTC … Mar 31, 2025 23:59:59 UTC  (Indian FY)
 */
export function parseFinancialYear(fy: string): { start: Date; end: Date } {
  if (/^\d{4}$/.test(fy)) {
    const year = parseInt(fy, 10);
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
    };
  }
  const match = /^(\d{4})-(\d{2})$/.exec(fy);
  if (match) {
    const startYear = parseInt(match[1]!, 10);
    const endYear = startYear + 1; // "2024-25" → FY Apr 2024 – Mar 2025
    return {
      start: new Date(Date.UTC(startYear, 3, 1)),       // Apr 1 of start year
      end:   new Date(Date.UTC(endYear,   2, 31, 23, 59, 59, 999)), // Mar 31 of next year
    };
  }
  throw new Error(`Invalid financial year format "${fy}". Use "2024" or "2024-25".`);
}

/**
 * Returns the current financial year string in the format appropriate for the country:
 * - "IN" → "YYYY-YY" (Indian FY, Apr–Mar)
 * - others → "YYYY"  (calendar year)
 */
export function currentFinancialYear(countryCode: string): string {
  const now = new Date();
  if (countryCode.toUpperCase() === "IN") {
    const month = now.getUTCMonth(); // 0-indexed
    const year = now.getUTCFullYear();
    const fyStartYear = month >= 3 ? year : year - 1; // April (month=3) starts new FY
    return `${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
  }
  return String(now.getUTCFullYear());
}
