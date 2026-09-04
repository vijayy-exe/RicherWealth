import {
  generateAmortizationSchedule,
  getScheduleSnapshot,
  calculatePrepaymentSavings,
  calculateCreditCardMinimumPayment,
  projectCreditCardMinimumPayoff,
  computeEmi,
  compareLoans,
} from "./amortization";

describe("generateAmortizationSchedule", () => {
  it("matches a standard loan calculator's output to the cent (classic $200,000 @ 6% / 30yr mortgage)", () => {
    // Independently cross-checked against Python (double-precision, same
    // level-payment formula) and the well-known published figure for this
    // textbook example: EMI ≈ $1,199.10.
    const result = generateAmortizationSchedule({
      principal: 200_000,
      annualRatePct: 6,
      tenureMonths: 360,
      paymentFrequency: "MONTHLY",
    });

    expect(result.scheduledPayment).toBeCloseTo(1199.1, 2);
    expect(result.actualPeriods).toBe(360);
    expect(result.nominalPeriods).toBe(360);
    expect(result.totalInterest).toBeCloseTo(231677.04, 2);

    const last = result.schedule[result.schedule.length - 1];
    expect(last?.remainingBalance).toBe(0);

    // Total principal repaid across the whole schedule must equal the original principal to the cent.
    expect(last?.cumulativePrincipal).toBeCloseTo(200_000, 2);
  });

  it("matches a hand/independently-verified small loan example ($10,000 @ 12% / 12mo)", () => {
    const result = generateAmortizationSchedule({
      principal: 10_000,
      annualRatePct: 12,
      tenureMonths: 12,
      paymentFrequency: "MONTHLY",
    });

    expect(result.scheduledPayment).toBeCloseTo(888.49, 2);
    expect(result.totalInterest).toBeCloseTo(661.86, 2);
    expect(result.actualPeriods).toBe(12);

    const first = result.schedule[0];
    expect(first?.interestPortion).toBeCloseTo(100, 2);
    expect(first?.principalPortion).toBeCloseTo(788.49, 2);
  });

  it("exposes remaining balance, interest paid to date, and interest-to-principal ratio at an arbitrary point in time", () => {
    const result = generateAmortizationSchedule({
      principal: 10_000,
      annualRatePct: 12,
      tenureMonths: 12,
      paymentFrequency: "MONTHLY",
    });

    const snapshotAt6 = getScheduleSnapshot(result, 6);
    expect(snapshotAt6).not.toBeNull();
    expect(snapshotAt6?.period).toBe(6);
    expect(snapshotAt6?.remainingBalance).toBeGreaterThan(0);
    expect(snapshotAt6?.remainingBalance).toBeLessThan(10_000);
    expect(snapshotAt6?.interestToPrincipalRatio).toBeCloseTo(
      (snapshotAt6?.cumulativeInterest ?? 0) / (snapshotAt6?.cumulativePrincipal ?? 1),
      6,
    );

    // Clamps to the final row past the end of the schedule instead of returning null/undefined.
    const beyondEnd = getScheduleSnapshot(result, 999);
    expect(beyondEnd?.period).toBe(12);
    expect(beyondEnd?.remainingBalance).toBe(0);
  });

  it("handles a zero-interest loan without dividing by zero", () => {
    const result = generateAmortizationSchedule({ principal: 1200, annualRatePct: 0, tenureMonths: 12 });
    expect(result.scheduledPayment).toBeCloseTo(100, 2);
    expect(result.totalInterest).toBe(0);
    expect(result.schedule.every((row) => row.interestPortion === 0)).toBe(true);
  });

  it("supports non-monthly payment frequencies (biweekly)", () => {
    const result = generateAmortizationSchedule({
      principal: 10_000,
      annualRatePct: 12,
      tenureMonths: 12,
      paymentFrequency: "BIWEEKLY",
    });
    // 12 months of tenure at 26 periods/year ≈ 26 periods.
    expect(result.nominalPeriods).toBe(26);
    expect(result.periodsPerYear).toBe(26);
    expect(result.schedule[result.schedule.length - 1]?.remainingBalance).toBe(0);
  });
});

describe("calculatePrepaymentSavings", () => {
  it("shows interest saved and tenure reduction for a hypothetical extra payment (cross-checked independently)", () => {
    const result = calculatePrepaymentSavings({
      principal: 10_000,
      annualRatePct: 12,
      tenureMonths: 12,
      paymentFrequency: "MONTHLY",
      extraPaymentPerPeriod: 200,
    });

    expect(result.baseline.actualPeriods).toBe(12);
    expect(result.withPrepayment.actualPeriods).toBe(10);
    expect(result.periodsReduced).toBe(2);
    expect(result.monthsReduced).toBeCloseTo(2, 5);
    expect(result.interestSaved).toBeCloseTo(118.74, 2);
    expect(result.newPayoffPeriods).toBe(10);
  });

  it("returns zero savings when no extra payment is made", () => {
    const result = calculatePrepaymentSavings({
      principal: 10_000,
      annualRatePct: 12,
      tenureMonths: 12,
      extraPaymentPerPeriod: 0,
    });
    expect(result.interestSaved).toBe(0);
    expect(result.periodsReduced).toBe(0);
  });
});

describe("calculateCreditCardMinimumPayment", () => {
  it("is correct for a revolving-balance test case ($5,000 @ 18% APR, 3% min / $25 floor)", () => {
    // Independently cross-checked: monthlyInterest = 5000 * (18/100/12) = 75;
    // percentOfBalance = 5000 * 0.03 = 150 > flat $25 floor, so minimumPayment = 150;
    // principalPortion = 150 - 75 = 75.
    const result = calculateCreditCardMinimumPayment({
      balance: 5000,
      apr: 18,
      minPaymentPercent: 3,
      minPaymentFlat: 25,
    });

    expect(result.monthlyInterest).toBeCloseTo(75, 2);
    expect(result.minimumPayment).toBeCloseTo(150, 2);
    expect(result.principalPortion).toBeCloseTo(75, 2);
  });

  it("falls back to the flat-dollar floor when the percentage-of-balance minimum is smaller", () => {
    // 1% of a $500 balance is $5 — below the $25 flat floor.
    const result = calculateCreditCardMinimumPayment({
      balance: 500,
      apr: 20,
      minPaymentPercent: 1,
      minPaymentFlat: 25,
    });
    expect(result.minimumPayment).toBe(25);
  });

  it("never asks for more than the balance plus accrued interest", () => {
    const result = calculateCreditCardMinimumPayment({ balance: 10, apr: 24, minPaymentPercent: 5, minPaymentFlat: 25 });
    expect(result.minimumPayment).toBeLessThanOrEqual(10 + result.monthlyInterest + 0.01);
  });
});

describe("projectCreditCardMinimumPayoff", () => {
  it("matches an independently-verified payoff simulation for a revolving balance", () => {
    // Cross-checked independently in Python: paying only the declining
    // minimum on a $5,000 balance @ 18% APR / 3% min-of-balance takes 166
    // months and costs ≈ $4,497.27 in total interest.
    const result = projectCreditCardMinimumPayoff({
      balance: 5000,
      apr: 18,
      minPaymentPercent: 3,
      minPaymentFlat: 25,
    });

    expect(result.monthsToPayoff).toBe(166);
    expect(result.totalInterestPaid).toBeCloseTo(4497.27, 1);
    expect(result.neverPaysOff).toBe(false);
    expect(result.months[result.months.length - 1]?.remainingBalance).toBe(0);
  });

  it("detects a minimum payment that never covers interest (negative amortization) and terminates", () => {
    const result = projectCreditCardMinimumPayoff({
      balance: 10_000,
      apr: 36,
      minPaymentPercent: 0.5,
      minPaymentFlat: 5,
    });
    expect(result.neverPaysOff).toBe(true);
    expect(result.monthsToPayoff).toBeLessThan(600);
  });
});

describe("computeEmi (Phase 13 EMI calculator)", () => {
  it("matches the same $200,000 @ 6% / 30yr reference EMI as generateAmortizationSchedule", () => {
    const emi = computeEmi(200_000, 6, 360, "MONTHLY");
    expect(emi).toBeCloseTo(1199.10, 1);
  });
});

describe("compareLoans (Phase 13 Loan Comparison calculator)", () => {
  it("identifies the offer with lower total interest as cheapest even when its EMI is higher", () => {
    // Offer A: shorter tenure, higher EMI, less total interest.
    // Offer B: longer tenure, lower EMI, more total interest.
    const { results, cheapestIndex } = compareLoans([
      { label: "15-year @ 6%", principal: 300_000, annualRatePct: 6, tenureMonths: 180 },
      { label: "30-year @ 6%", principal: 300_000, annualRatePct: 6, tenureMonths: 360 },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]!.scheduledPayment).toBeGreaterThan(results[1]!.scheduledPayment);
    expect(results[0]!.totalInterest).toBeLessThan(results[1]!.totalInterest);
    expect(cheapestIndex).toBe(0);
  });

  it("matches each offer's individual generateAmortizationSchedule result exactly", () => {
    const offer = { label: "Test", principal: 500_000, annualRatePct: 8.5, tenureMonths: 240 };
    const direct = generateAmortizationSchedule(offer);
    const { results } = compareLoans([offer]);
    expect(results[0]!.scheduledPayment).toBe(direct.scheduledPayment);
    expect(results[0]!.totalInterest).toBe(direct.totalInterest);
  });
});
