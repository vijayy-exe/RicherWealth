/**
 * Schema-driven ITR-1/2/3/4 (India) text parser. Deliberately NOT a
 * generic free-text/NLP extractor — real Indian ITR acknowledgement/
 * summary pages use a small, fairly stable set of section labels year to
 * year, so this is a table of label patterns → field, each carrying its
 * own confidence. A field whose best-matching pattern is weak, or that
 * matches nothing at all, is flagged `needsReview` rather than guessed —
 * see FieldWithConfidence's header comment in itr-types.ts.
 *
 * Pure function of raw text → ParsedItrData. Runs identically whether the
 * text came from pdf-parse (real text layer) or tesseract.js OCR (a scanned
 * page/image) — both hand this module a text string, so this parser is
 * unit-testable without a PDF or an image in sight, and is the ONE place
 * ITR field-matching logic lives (both extraction paths call this, not a
 * decision tree duplicated per source).
 */

import { field, type FieldWithConfidence, type ParsedItrData } from "./itr-types";

/** Strip Indian-style digit grouping (8,50,000) or Western (850,000) — comma removal works for both. */
function toNumber(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

const AMOUNT = String.raw`(?:Rs\.?|₹|INR)?\s*[:\-]?\s*([\d][\d,]*(?:\.\d{1,2})?)`;

interface LabelPattern {
  regex: RegExp;
  confidence: number;
}

function extractAmount(text: string, patterns: LabelPattern[], threshold = 0.6): FieldWithConfidence<number> {
  let best: { value: number; confidence: number } | null = null;
  for (const p of patterns) {
    const m = p.regex.exec(text);
    if (m?.[1]) {
      const value = toNumber(m[1]);
      if (!Number.isFinite(value)) continue;
      if (!best || p.confidence > best.confidence) best = { value, confidence: p.confidence };
    }
  }
  return best ? field(best.value, best.confidence, threshold) : field<number>(null, 0, threshold);
}

function labelPatterns(labels: { text: string; confidence: number }[]): LabelPattern[] {
  return labels.map(({ text, confidence }) => ({
    // label, then up to ~40 chars of separators/words, then the amount — bounded
    // AND newline-excluded, so we never jump past this line onto the next one
    // (a section header like "PART B - GROSS TOTAL INCOME" must not pick up
    // the following line's unrelated figure just because it's within 40 chars).
    regex: new RegExp(`${text}[^\\d₹\\n]{0,40}?${AMOUNT}`, "i"),
    confidence,
  }));
}

/**
 * Heuristic for "does this PDF have a real text layer, or is it a flat
 * scanned image?" pdf-parse always returns SOME string (often whitespace/
 * control characters from the PDF's internal structure even on a fully
 * scanned page), so "empty" isn't a safe test — average non-whitespace
 * characters per page is. A real ITR summary page has hundreds of
 * characters of label/value text; a scanned page with no text layer
 * typically yields near-zero.
 */
export function hasTextLayer(extractedText: string, pageCount: number): boolean {
  if (pageCount <= 0) return false;
  const meaningfulChars = extractedText.replace(/\s/g, "").length;
  const perPage = meaningfulChars / pageCount;
  return perPage >= 50;
}

export function detectAssessmentYear(text: string): FieldWithConfidence<string> {
  const patterns: LabelPattern[] = [
    { regex: /Assessment\s*Year[^\d]{0,10}(\d{4}-\d{2})/i, confidence: 0.95 },
    { regex: /A\.?Y\.?[^\d]{0,10}(\d{4}-\d{2})/i, confidence: 0.8 },
  ];
  for (const p of patterns) {
    const m = p.regex.exec(text);
    if (m?.[1]) return field(m[1], p.confidence);
  }
  return field<string>(null, 0);
}

export function detectFormType(text: string): FieldWithConfidence<"ITR-1" | "ITR-2" | "ITR-3" | "ITR-4"> {
  const m = /ITR[\s-]?([1234])\b/i.exec(text);
  if (!m) return field<"ITR-1" | "ITR-2" | "ITR-3" | "ITR-4">(null, 0);
  const form = `ITR-${m[1]}` as "ITR-1" | "ITR-2" | "ITR-3" | "ITR-4";
  return field(form, 0.85);
}

const DEDUCTION_SECTIONS: Record<string, string[]> = {
  "80C": ["(?:Section\\s*)?80\\s*C(?!\\d)"],
  "80D": ["(?:Section\\s*)?80\\s*D(?!\\d)"],
  "80G": ["(?:Section\\s*)?80\\s*G(?!\\d)"],
  "80TTA": ["(?:Section\\s*)?80\\s*TTA"],
  STANDARD_DEDUCTION: ["Standard\\s*Deduction"],
};

export function parseItrText(rawText: string): ParsedItrData {
  // Normalize whitespace (OCR/PDF text often has irregular line breaks/spacing between a label and its value).
  const text = rawText.replace(/[ \t]+/g, " ");

  const grossTotalIncome = extractAmount(text, labelPatterns([
    { text: "Gross\\s*Total\\s*Income", confidence: 0.95 },
  ]));

  const salary = extractAmount(text, labelPatterns([
    { text: "Income\\s*(?:from|under\\s*the\\s*head)\\s*Salar(?:y|ies)", confidence: 0.9 },
    { text: "Salar(?:y|ies)", confidence: 0.5 },
  ]));

  const houseProperty = extractAmount(text, labelPatterns([
    { text: "Income\\s*from\\s*House\\s*Property", confidence: 0.9 },
    { text: "House\\s*Property", confidence: 0.55 },
  ]));

  const otherSources = extractAmount(text, labelPatterns([
    { text: "Income\\s*from\\s*Other\\s*Sources", confidence: 0.9 },
  ]));

  const business = extractAmount(text, labelPatterns([
    { text: "Profits?\\s*and\\s*Gains?\\s*(?:of|from)\\s*Business\\s*(?:or|and)?\\s*Profession", confidence: 0.9 },
    { text: "Income\\s*(?:from\\s*)?Business\\s*(?:or|and)?\\s*Profession(?:al)?", confidence: 0.85 },
    { text: "Business\\s*(?:or|and)?\\s*Profession(?:al)?\\s*Income", confidence: 0.7 },
  ]));

  // Negative lookbehind excludes "Short/Long Term Capital Gains" sub-lines so
  // this only matches a genuine standalone "(Total) Capital Gains" head line,
  // never accidentally grabbing one schedule line's figure as the head total.
  const capitalGainsHead = extractAmount(text, labelPatterns([
    { text: "(?<!Term\\s)(?:Total\\s*)?Capital\\s*Gains?(?!\\s*Schedule)", confidence: 0.6 },
  ]));

  const stcg = extractAmount(text, labelPatterns([
    { text: "Short[\\s-]*Term\\s*Capital\\s*Gains?", confidence: 0.9 },
    { text: "STCG", confidence: 0.85 },
  ]));

  const ltcg = extractAmount(text, labelPatterns([
    { text: "Long[\\s-]*Term\\s*Capital\\s*Gains?", confidence: 0.9 },
    { text: "LTCG", confidence: 0.85 },
  ]));

  // If no direct "Capital Gains" head total was found but both schedule lines were, derive it — still a real parsed value, not a guess, since it's a straight sum of two other parsed fields.
  const capitalGains = capitalGainsHead.value !== null
    ? capitalGainsHead
    : (stcg.value !== null || ltcg.value !== null)
      ? field((stcg.value ?? 0) + (ltcg.value ?? 0), Math.min(stcg.confidence || 1, ltcg.confidence || 1) * 0.9)
      : capitalGainsHead;

  const totalTaxPaid = extractAmount(text, labelPatterns([
    { text: "Total\\s*Tax\\s*Paid", confidence: 0.95 },
    { text: "Total\\s*Tax\\s*and\\s*Interest\\s*Payable", confidence: 0.75 },
    { text: "Total\\s*Tax\\s*Liability", confidence: 0.7 },
  ]));

  const refundAmount = extractAmount(text, labelPatterns([
    { text: "Refund", confidence: 0.9 },
  ]));
  const demandAmount = extractAmount(text, labelPatterns([
    { text: "Amount\\s*Payable", confidence: 0.85 },
    { text: "Tax\\s*Payable", confidence: 0.6 },
  ]));
  let refundOrDemand: FieldWithConfidence<{ type: "REFUND" | "DEMAND" | "NIL"; amount: number }>;
  if (refundAmount.value !== null && refundAmount.value > 0) {
    refundOrDemand = field({ type: "REFUND", amount: refundAmount.value }, refundAmount.confidence);
  } else if (demandAmount.value !== null && demandAmount.value > 0) {
    refundOrDemand = field({ type: "DEMAND", amount: demandAmount.value }, demandAmount.confidence);
  } else if (refundAmount.value === 0 || demandAmount.value === 0) {
    refundOrDemand = field({ type: "NIL", amount: 0 }, Math.max(refundAmount.confidence, demandAmount.confidence));
  } else {
    refundOrDemand = field<{ type: "REFUND" | "DEMAND" | "NIL"; amount: number }>(null, 0);
  }

  const deductions: Record<string, FieldWithConfidence<number>> = {};
  for (const [code, labels] of Object.entries(DEDUCTION_SECTIONS)) {
    deductions[code] = extractAmount(text, labelPatterns(labels.map((l) => ({ text: l, confidence: 0.8 }))));
  }

  return {
    assessmentYear: detectAssessmentYear(text),
    formType: detectFormType(text),
    grossTotalIncome,
    incomeByHead: { salary, houseProperty, capitalGains, otherSources, business },
    deductions,
    totalTaxPaid,
    refundOrDemand,
    capitalGainsSchedule: { stcg, ltcg },
  };
}
