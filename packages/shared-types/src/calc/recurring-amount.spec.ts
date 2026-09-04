import { toMonthlyAmount, toAnnualAmount } from "./recurring-amount";

describe("toMonthlyAmount", () => {
  it("converts each frequency to its monthly equivalent", () => {
    expect(toMonthlyAmount(1200, "ANNUALLY")).toBeCloseTo(100, 6);
    expect(toMonthlyAmount(300, "QUARTERLY")).toBeCloseTo(100, 6);
    expect(toMonthlyAmount(100, "MONTHLY")).toBe(100);
    expect(toMonthlyAmount(50, "BIWEEKLY")).toBeCloseTo((50 * 26) / 12, 6);
    expect(toMonthlyAmount(25, "WEEKLY")).toBeCloseTo((25 * 52) / 12, 6);
  });

  it("excludes one-time entries from the monthly rollup", () => {
    expect(toMonthlyAmount(5000, "ONE_TIME")).toBe(0);
  });
});

describe("toAnnualAmount", () => {
  it("converts each frequency to its annual equivalent", () => {
    expect(toAnnualAmount(100, "MONTHLY")).toBeCloseTo(1200, 6);
    expect(toAnnualAmount(300, "QUARTERLY")).toBeCloseTo(1200, 6);
  });

  it("treats a one-time entry as its own annual total", () => {
    expect(toAnnualAmount(5000, "ONE_TIME")).toBe(5000);
  });
});
