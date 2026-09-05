import { computeItrDiscrepancies, type TrackedFigures } from "./itr-discrepancy";
import { field } from "./itr-types";
import { parseItrText } from "./itr-parser";

describe("computeItrDiscrepancies", () => {
  const baseTracked: TrackedFigures = {
    computedStcg: 50000,
    computedLtcg: 200000,
    recordedSalaryIncome: 1200000,
    recordedHousePropertyIncome: 150000,
    recordedBusinessIncome: 0,
    recordedOtherSourcesIncome: 25000,
  };

  it("flags a synthetic case where parsed ITR LTCG differs from computed capital gains, with the correct delta (acceptance criterion)", () => {
    const parsed = parseItrText(`
      Form ITR-2
      Assessment Year: 2025-26
      Long Term Capital Gains Rs. 3,50,000
      Short Term Capital Gains Rs. 50,000
    `);

    const report = computeItrDiscrepancies(parsed, baseTracked, "2025-26", "2024-25", "INR");

    const ltcgLine = report.lines.find((l) => l.field === "capitalGainsSchedule.ltcg");
    expect(ltcgLine).toBeDefined();
    expect(ltcgLine!.itrValue).toBe(350000);
    expect(ltcgLine!.trackedValue).toBe(200000);
    expect(ltcgLine!.delta).toBe(150000); // 350000 - 200000, exactly the acceptance criterion's "flag with the right delta"

    // STCG matches exactly (50000 == 50000) — must NOT be flagged.
    const stcgLine = report.lines.find((l) => l.field === "capitalGainsSchedule.stcg");
    expect(stcgLine).toBeUndefined();
  });

  it("does not flag a field the ITR parser never found a value for (null stays null, no false discrepancy)", () => {
    const parsed = parseItrText("Assessment Year: 2025-26\nGross Total Income Rs. 10,00,000");
    const report = computeItrDiscrepancies(parsed, baseTracked, "2025-26", "2024-25", "INR");
    expect(report.lines.find((l) => l.field === "capitalGainsSchedule.ltcg")).toBeUndefined();
    expect(report.lines.find((l) => l.field === "capitalGainsSchedule.stcg")).toBeUndefined();
  });

  it("ignores differences below the materiality threshold (rounding noise)", () => {
    const parsed = parseItrText("Assessment Year: 2025-26\nLong Term Capital Gains Rs. 2,00,000.40");
    const report = computeItrDiscrepancies(parsed, baseTracked, "2025-26", "2024-25", "INR");
    expect(report.lines.find((l) => l.field === "capitalGainsSchedule.ltcg")).toBeUndefined();
  });

  it("carries the ITR field's needsReview flag through onto the discrepancy line", () => {
    const lowConfidenceParsed = {
      assessmentYear: field("2025-26", 0.9),
      formType: field<"ITR-1" | "ITR-2" | "ITR-3" | "ITR-4">(null, 0),
      grossTotalIncome: field<number>(null, 0),
      incomeByHead: {
        salary: field<number>(null, 0),
        houseProperty: field<number>(null, 0),
        capitalGains: field<number>(null, 0),
        otherSources: field<number>(null, 0),
        business: field<number>(null, 0),
      },
      deductions: {},
      totalTaxPaid: field<number>(null, 0),
      refundOrDemand: field<{ type: "REFUND" | "DEMAND" | "NIL"; amount: number }>(null, 0),
      capitalGainsSchedule: {
        stcg: field<number>(null, 0),
        ltcg: field(999999, 0.4), // present but below the 0.6 review threshold
      },
    };
    const report = computeItrDiscrepancies(lowConfidenceParsed, baseTracked, "2025-26", "2024-25", "INR");
    const ltcgLine = report.lines.find((l) => l.field === "capitalGainsSchedule.ltcg");
    expect(ltcgLine!.itrFieldNeedsReview).toBe(true);
  });
});
