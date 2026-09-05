import { parseItrText, hasTextLayer, detectAssessmentYear, detectFormType } from "./itr-parser";
import { assessmentYearToFinancialYear, financialYearToAssessmentYear } from "./itr-types";

const SAMPLE_ITR1_TEXT = `
INCOME TAX RETURN ACKNOWLEDGEMENT
Form ITR-1
Assessment Year: 2025-26
PART B - GROSS TOTAL INCOME
Income from Salary Rs. 12,00,000
Income from House Property Rs. 1,50,000
Income from Other Sources Rs. 25,000
Gross Total Income Rs. 13,75,000
PART C - DEDUCTIONS
Deduction under Section 80C Rs. 1,50,000
Section 80D Rs. 25,000
PART D - TAX PAID
Total Tax Paid Rs. 2,10,000
Refund Rs. 15,000
`;

const SAMPLE_ITR2_WITH_CAPITAL_GAINS = `
Form ITR-2
Assessment Year: 2024-25
Gross Total Income Rs. 20,00,000
Short Term Capital Gains Rs. 80,000
Long Term Capital Gains Rs. 3,20,000
Income from Business or Profession Rs. 5,00,000
Total Tax Paid Rs. 4,50,000
Amount Payable Rs. 12,000
`;

describe("hasTextLayer", () => {
  it("detects a real text layer from substantial extracted text", () => {
    expect(hasTextLayer(SAMPLE_ITR1_TEXT, 2)).toBe(true);
  });

  it("flags a scanned page with near-empty extracted text as having no text layer", () => {
    expect(hasTextLayer("\n\n  \x00\x00 \n", 1)).toBe(false);
  });

  it("returns false for zero pages", () => {
    expect(hasTextLayer("anything", 0)).toBe(false);
  });
});

describe("detectAssessmentYear / detectFormType", () => {
  it("extracts assessment year with high confidence from an exact label", () => {
    const result = detectAssessmentYear(SAMPLE_ITR1_TEXT);
    expect(result.value).toBe("2025-26");
    expect(result.needsReview).toBe(false);
  });

  it("detects ITR-1 form type", () => {
    expect(detectFormType(SAMPLE_ITR1_TEXT).value).toBe("ITR-1");
  });

  it("detects ITR-2 form type", () => {
    expect(detectFormType(SAMPLE_ITR2_WITH_CAPITAL_GAINS).value).toBe("ITR-2");
  });

  it("flags needsReview when nothing matches", () => {
    const result = detectAssessmentYear("no relevant text here");
    expect(result.value).toBeNull();
    expect(result.needsReview).toBe(true);
  });
});

describe("parseItrText — ITR-1, full field set", () => {
  const parsed = parseItrText(SAMPLE_ITR1_TEXT);

  it("parses assessment year and form type", () => {
    expect(parsed.assessmentYear.value).toBe("2025-26");
    expect(parsed.formType.value).toBe("ITR-1");
  });

  it("parses gross total income exactly", () => {
    expect(parsed.grossTotalIncome.value).toBe(1375000);
    expect(parsed.grossTotalIncome.needsReview).toBe(false);
  });

  it("parses income-by-head exactly", () => {
    expect(parsed.incomeByHead.salary.value).toBe(1200000);
    expect(parsed.incomeByHead.houseProperty.value).toBe(150000);
    expect(parsed.incomeByHead.otherSources.value).toBe(25000);
  });

  it("parses deductions exactly", () => {
    expect(parsed.deductions["80C"]!.value).toBe(150000);
    expect(parsed.deductions["80D"]!.value).toBe(25000);
  });

  it("flags deductions with no match in the source text as needing review, not zero", () => {
    expect(parsed.deductions["80G"]!.value).toBeNull();
    expect(parsed.deductions["80G"]!.needsReview).toBe(true);
  });

  it("parses total tax paid and refund exactly", () => {
    expect(parsed.totalTaxPaid.value).toBe(210000);
    expect(parsed.refundOrDemand.value).toEqual({ type: "REFUND", amount: 15000 });
  });

  it("business income is unparsed (not present in this form) and flagged for review, not defaulted to 0", () => {
    expect(parsed.incomeByHead.business.value).toBeNull();
    expect(parsed.incomeByHead.business.needsReview).toBe(true);
  });
});

describe("parseItrText — ITR-2, capital gains schedule + demand", () => {
  const parsed = parseItrText(SAMPLE_ITR2_WITH_CAPITAL_GAINS);

  it("parses STCG and LTCG exactly", () => {
    expect(parsed.capitalGainsSchedule.stcg.value).toBe(80000);
    expect(parsed.capitalGainsSchedule.ltcg.value).toBe(320000);
  });

  it("derives the capital-gains income-head total from STCG+LTCG when no direct head total is present", () => {
    expect(parsed.incomeByHead.capitalGains.value).toBe(400000);
  });

  it("parses business income exactly", () => {
    expect(parsed.incomeByHead.business.value).toBe(500000);
  });

  it("classifies a demand (amount payable), not a refund", () => {
    expect(parsed.refundOrDemand.value).toEqual({ type: "DEMAND", amount: 12000 });
  });
});

describe("Assessment Year <-> Financial Year conversion", () => {
  it("AY 2025-26 corresponds to FY 2024-25 (income earned Apr'24-Mar'25 assessed in AY 2025-26)", () => {
    expect(assessmentYearToFinancialYear("2025-26")).toBe("2024-25");
  });

  it("round-trips", () => {
    expect(financialYearToAssessmentYear(assessmentYearToFinancialYear("2025-26"))).toBe("2025-26");
  });

  it("rejects a malformed assessment year", () => {
    expect(() => assessmentYearToFinancialYear("2025")).toThrow();
  });
});
