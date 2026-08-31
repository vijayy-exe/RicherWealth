import { computeGrahamValue, computeFairValueFlag } from "./analytics.service";

describe("computeGrahamValue", () => {
  it("returns √(22.5 × EPS × BVPS) for valid inputs", () => {
    // 22.5 × 3.0 × 20.0 = 1350 → √1350 ≈ 36.7423...
    const result = computeGrahamValue(3.0, 20.0);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(36.742, 2);
  });

  it("returns null when EPS is zero", () => {
    expect(computeGrahamValue(0, 20)).toBeNull();
  });

  it("returns null when BVPS is negative", () => {
    expect(computeGrahamValue(3.0, -5)).toBeNull();
  });

  it("returns null when both inputs are null", () => {
    expect(computeGrahamValue(null, null)).toBeNull();
  });

  it("computes correctly for a well-known example (AAPL-like numbers)", () => {
    // EPS ≈ 6.43, BVPS ≈ 4.25 → Graham ≈ √(22.5 × 6.43 × 4.25) ≈ √614.6 ≈ 24.79
    const result = computeGrahamValue(6.43, 4.25);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(24.79, 1);
  });

  it("handles very large values without overflow", () => {
    const result = computeGrahamValue(1000, 5000);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(Math.sqrt(22.5 * 1000 * 5000), 2);
  });
});

describe("computeFairValueFlag", () => {
  const graham = 36.742;

  it("UNDERVALUED when price < 67% of graham value", () => {
    // 0.67 × 36.742 = 24.62 → price 20 is below that
    expect(computeFairValueFlag(20, graham)).toBe("UNDERVALUED");
  });

  it("FAIR when price is between 67% and 150% of graham value", () => {
    expect(computeFairValueFlag(36, graham)).toBe("FAIR");
  });

  it("OVERVALUED when price > 150% of graham value", () => {
    // 1.5 × 36.742 = 55.11 → price 60 is above
    expect(computeFairValueFlag(60, graham)).toBe("OVERVALUED");
  });

  it("NO_DATA when grahamValue is null", () => {
    expect(computeFairValueFlag(100, null)).toBe("NO_DATA");
  });

  it("correctly classifies at exactly 67% boundary — FAIR (not strictly < 0.67)", () => {
    // price === 0.67 × graham → ratio = 0.67 → NOT strictly < 0.67 → FAIR
    const price = graham * 0.67;
    expect(computeFairValueFlag(price, graham)).toBe("FAIR");
  });

  it("UNDERVALUED when price is just below 67% boundary", () => {
    const price = graham * 0.669; // just inside the undervalued zone
    expect(computeFairValueFlag(price, graham)).toBe("UNDERVALUED");
  });

  it("correctly classifies at exactly 150% boundary (edge case)", () => {
    const price = graham * 1.5; // exactly on the overvalued boundary
    // price > 1.5 is OVERVALUED, price === 1.5 is still FAIR
    expect(computeFairValueFlag(price, graham)).toBe("FAIR");
  });
});
