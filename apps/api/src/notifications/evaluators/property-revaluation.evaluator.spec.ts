import { pctChange, PROPERTY_CHANGE_THRESHOLD_PCT } from "./property-revaluation.evaluator";

describe("pctChange", () => {
  it("computes a positive delta", () => {
    expect(pctChange(100, 110)).toBeCloseTo(10);
  });

  it("computes a negative delta", () => {
    expect(pctChange(100, 90)).toBeCloseTo(-10);
  });

  it("returns null when the previous value is zero (division by zero guard)", () => {
    expect(pctChange(0, 50)).toBeNull();
  });

  it("threshold check: a delta at/above PROPERTY_CHANGE_THRESHOLD_PCT should be treated as significant", () => {
    const delta = pctChange(1000000, 1000000 * (1 + PROPERTY_CHANGE_THRESHOLD_PCT / 100));
    expect(Math.abs(delta!)).toBeGreaterThanOrEqual(PROPERTY_CHANGE_THRESHOLD_PCT);
  });
});
