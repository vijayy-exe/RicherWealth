import { compoundGrowth, sipFutureValue, requiredSipForTarget, monthsToTarget, requiredLumpsumForTarget } from "./compound-growth";

describe("compoundGrowth", () => {
  it("matches the textbook annual-compounding reference: 100000 @ 10% for 3 years = 133100", () => {
    // FV = 100000 * 1.1^3 = 100000 * 1.331 = 133100 exactly
    const result = compoundGrowth({ principal: 100_000, annualRatePct: 10, years: 3, compoundingPerYear: 1 });
    expect(result.futureValue).toBeCloseTo(133_100, 6);
    expect(result.totalInterest).toBeCloseTo(33_100, 6);
  });

  it("matches quarterly compounding (FD convention): 100000 @ 8% for 2 years, n=4", () => {
    const expected = 100_000 * Math.pow(1 + 0.08 / 4, 4 * 2); // independently derived, not via the function under test
    const result = compoundGrowth({ principal: 100_000, annualRatePct: 8, years: 2, compoundingPerYear: 4 });
    expect(result.futureValue).toBeCloseTo(expected, 2);
  });

  it("produces a yearly schedule starting at the principal (year 0)", () => {
    const result = compoundGrowth({ principal: 50_000, annualRatePct: 6, years: 2, compoundingPerYear: 1 });
    expect(result.yearlySchedule[0]).toEqual({ year: 0, value: 50_000, interestEarned: 0 });
    expect(result.yearlySchedule).toHaveLength(3); // years 0, 1, 2
  });

  it("returns the principal unchanged at 0% interest", () => {
    const result = compoundGrowth({ principal: 25_000, annualRatePct: 0, years: 5, compoundingPerYear: 1 });
    expect(result.futureValue).toBe(25_000);
  });
});

describe("sipFutureValue", () => {
  it("matches the textbook annuity-due reference: ₹10,000/mo @ 12% p.a. for 12 months", () => {
    // FV = P * [((1+i)^n - 1)/i] * (1+i), i = 0.01, n = 12 — independently derived
    const i = 0.01;
    const expected = 10_000 * ((Math.pow(1 + i, 12) - 1) / i) * (1 + i);
    const result = sipFutureValue({ monthlyContribution: 10_000, annualRatePct: 12, months: 12 });
    expect(result.futureValue).toBeCloseTo(expected, 2);
    expect(result.futureValue).toBeCloseTo(128_093.28, 2);
  });

  it("equals contribution * months exactly at 0% interest", () => {
    const result = sipFutureValue({ monthlyContribution: 10_000, annualRatePct: 0, months: 12 });
    expect(result.futureValue).toBe(120_000);
    expect(result.totalInvested).toBe(120_000);
    expect(result.totalGain).toBe(0);
  });

  it("produces a monthly schedule of the correct length with monotonically increasing invested amounts", () => {
    const result = sipFutureValue({ monthlyContribution: 5_000, annualRatePct: 10, months: 24 });
    expect(result.monthlySchedule).toHaveLength(24);
    expect(result.monthlySchedule[0]?.invested).toBe(5_000);
    expect(result.monthlySchedule[23]?.invested).toBe(120_000);
  });
});

describe("requiredSipForTarget", () => {
  it("matches contribution/months exactly at 0% interest", () => {
    expect(requiredSipForTarget(120_000, 0, 0, 12)).toBe(10_000);
  });

  it("round-trips through sipFutureValue: the required SIP hits the target exactly", () => {
    const required = requiredSipForTarget(500_000, 50_000, 11, 60) as number;
    expect(required).not.toBeNull();
    const projected = sipFutureValue({ monthlyContribution: required, annualRatePct: 11, months: 60 });
    // projected FV should equal target minus the current value's own growth, i.e. ~500000 total
    const growthOfCurrent = 50_000 * Math.pow(1 + 0.11 / 12, 60);
    expect(projected.futureValue + growthOfCurrent).toBeCloseTo(500_000, 0);
  });

  it("returns 0 when the current value alone already meets the target", () => {
    expect(requiredSipForTarget(100_000, 200_000, 8, 12)).toBe(0);
  });

  it("returns null for a non-positive time horizon", () => {
    expect(requiredSipForTarget(100_000, 0, 8, 0)).toBeNull();
    expect(requiredSipForTarget(100_000, 0, 8, -5)).toBeNull();
  });
});

describe("monthsToTarget", () => {
  it("matches target/contribution exactly at 0% interest", () => {
    expect(monthsToTarget(120_000, 0, 0, 10_000)).toBe(12);
  });

  it("round-trips through sipFutureValue: contributing for the returned number of months hits (or just exceeds) the target", () => {
    const months = monthsToTarget(500_000, 50_000, 11, 6_000) as number;
    expect(months).not.toBeNull();
    const projected = sipFutureValue({ monthlyContribution: 6_000, annualRatePct: 11, months });
    const growthOfCurrent = 50_000 * Math.pow(1 + 0.11 / 12, months);
    expect(projected.futureValue + growthOfCurrent).toBeGreaterThanOrEqual(500_000 - 1); // -1 to absorb ceil() rounding at the boundary
  });

  it("is the approximate inverse of requiredSipForTarget: the contribution requiredSipForTarget computes for N months, fed back through monthsToTarget, returns close to N", () => {
    const months = 60;
    const required = requiredSipForTarget(500_000, 50_000, 11, months) as number;
    const roundTrippedMonths = monthsToTarget(500_000, 50_000, 11, required);
    expect(roundTrippedMonths).not.toBeNull();
    expect(roundTrippedMonths as number).toBeLessThanOrEqual(months);
    expect(roundTrippedMonths as number).toBeGreaterThan(months - 2); // ceil() rounding only, never off by more than ~1 month
  });

  it("a larger monthly contribution reaches the same target in fewer (or equal) months", () => {
    const monthsAtBaseline = monthsToTarget(500_000, 50_000, 11, 5_000) as number;
    const monthsBoosted = monthsToTarget(500_000, 50_000, 11, 10_000) as number;
    expect(monthsBoosted).toBeLessThan(monthsAtBaseline);
  });

  it("returns 0 when the current value alone already meets the target", () => {
    expect(monthsToTarget(100_000, 200_000, 8, 5_000)).toBe(0);
  });

  it("returns null when the contribution is non-positive and the target isn't already met", () => {
    expect(monthsToTarget(100_000, 0, 8, 0)).toBeNull();
    expect(monthsToTarget(100_000, 0, 8, -500)).toBeNull();
  });
});

describe("requiredLumpsumForTarget", () => {
  it("is the exact inverse of compoundGrowth's annual-compounding case", () => {
    // From the compoundGrowth test above: 100000 @ 10% for 3 years -> 133100
    expect(requiredLumpsumForTarget(133_100, 10, 3)).toBeCloseTo(100_000, 6);
  });

  it("returns null for a non-positive time horizon", () => {
    expect(requiredLumpsumForTarget(100_000, 8, 0)).toBeNull();
  });
});
