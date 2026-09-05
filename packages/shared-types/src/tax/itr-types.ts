/**
 * Phase 15 extension — ITR document upload & analysis. Shared between
 * apps/api (extraction/parsing/discrepancy services) and apps/web (upload
 * flow, review screen, discrepancy panel).
 *
 * Every extracted field is a FieldWithConfidence — never a bare value. A
 * parser that "found nothing" must say so (`value: null, needsReview: true`)
 * rather than default to 0, matching this repo's established honesty
 * convention (Phase 2's emergency-fund placeholder, Phase 14's `isLive`,
 * Phase 15's `isBackfillEstimate`).
 */

export interface FieldWithConfidence<T> {
  value: T | null;
  /** 0 (no match) – 1 (exact, unambiguous label match). */
  confidence: number;
  /** True whenever confidence is below the parser's review threshold, OR value is null. */
  needsReview: boolean;
}

export function field<T>(value: T | null, confidence: number, threshold = 0.6): FieldWithConfidence<T> {
  return { value, confidence, needsReview: value === null || confidence < threshold };
}

export interface IncomeByHead {
  salary: FieldWithConfidence<number>;
  houseProperty: FieldWithConfidence<number>;
  capitalGains: FieldWithConfidence<number>;
  otherSources: FieldWithConfidence<number>;
  business: FieldWithConfidence<number>;
}

export interface CapitalGainsSchedule {
  stcg: FieldWithConfidence<number>;
  ltcg: FieldWithConfidence<number>;
}

export type RefundOrDemandType = "REFUND" | "DEMAND" | "NIL";

export interface ParsedItrData {
  /** e.g. "2025-26" */
  assessmentYear: FieldWithConfidence<string>;
  /** Which ITR form this parser matched against (ITR-1/2/3/4), if detected. */
  formType: FieldWithConfidence<"ITR-1" | "ITR-2" | "ITR-3" | "ITR-4">;
  grossTotalIncome: FieldWithConfidence<number>;
  incomeByHead: IncomeByHead;
  /** Keyed by section code, e.g. "80C", "80D", "80TTA", "STANDARD_DEDUCTION". */
  deductions: Record<string, FieldWithConfidence<number>>;
  totalTaxPaid: FieldWithConfidence<number>;
  refundOrDemand: FieldWithConfidence<{ type: RefundOrDemandType; amount: number }>;
  capitalGainsSchedule: CapitalGainsSchedule;
}

export interface ItrDocumentDto {
  id: string;
  assessmentYear: string;
  originalFilename: string;
  mimeType: string;
  extractionStatus: "PENDING" | "PROCESSING" | "EXTRACTED_AWAITING_REVIEW" | "CONFIRMED" | "FAILED";
  extractionMethod: "PDF_TEXT" | "OCR" | null;
  confidenceScore: number | null;
  parsedData: ParsedItrData | null;
  errorMessage: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ItrDiscrepancyLine {
  label: string;
  /** dot-path into ParsedItrData, e.g. "capitalGainsSchedule.ltcg" */
  field: string;
  itrValue: number;
  trackedValue: number;
  delta: number;
  /** true when the ITR field itself was low-confidence/unparsed — the discrepancy is informational only, don't over-trust the delta */
  itrFieldNeedsReview: boolean;
}

export interface ItrDiscrepancyReport {
  assessmentYear: string;
  financialYear: string;
  currency: string;
  lines: ItrDiscrepancyLine[];
}

export interface ItrYearlyTrendPoint {
  assessmentYear: string;
  grossTotalIncome: number | null;
  totalTaxPaid: number | null;
}

// ─── India Assessment-Year ⇄ Financial-Year conversion ───────────────────────
// Indian ITRs are filed FOR a financial year but labeled BY the following
// assessment year: income earned in FY 2024-25 (Apr 2024–Mar 2025) is
// assessed in AY 2025-26. AY startYear = FY startYear + 1.

export function assessmentYearToFinancialYear(assessmentYear: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(assessmentYear);
  if (!match) throw new Error(`Invalid assessment year format "${assessmentYear}". Use "2025-26".`);
  const ayStart = parseInt(match[1]!, 10);
  const fyStart = ayStart - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

export function financialYearToAssessmentYear(financialYear: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(financialYear);
  if (!match) throw new Error(`Invalid financial year format "${financialYear}". Use "2024-25".`);
  const fyStart = parseInt(match[1]!, 10);
  const ayStart = fyStart + 1;
  return `${ayStart}-${String(ayStart + 1).slice(-2)}`;
}
