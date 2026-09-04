import { calculateRetirementPlan } from "./retirement";
import { requiredSipForTarget } from "./compound-growth";

describe("calculateRetirementPlan", () => {
  it("hand-computed exact case when post-retirement return equals inflation (real rate = 0)", () => {
    // realAnnualRate = 0 -> requiredCorpus = annualExpenseAtRetirement * yearsInRetirement, exactly
    const result = calculateRetirementPlan({
      currentAge: 60, retirementAge: 60, lifeExpectancy: 80, // already at retirement age -> no inflation growth applied
      currentMonthlyExpense: 10_000, inflationPct: 6,
      preRetirementReturnPct: 12, postRetirementReturnPct: 6,
    });
    expect(result.yearsToRetirement).toBe(0);
    expect(result.yearsInRetirement).toBe(20);
    expect(result.monthlyExpenseAtRetirement).toBe(10_000); // 0 years of inflation growth
    expect(result.requiredCorpusAtRetirement).toBe(10_000 * 12 * 20); // 2,400,000 exactly
  });

  it("matches the standard PV-of-real-annuity reference for a realistic scenario", () => {
    const input = {
      currentAge: 30, retirementAge: 60, lifeExpectancy: 85,
      currentMonthlyExpense: 50_000, inflationPct: 6,
      preRetirementReturnPct: 12, postRetirementReturnPct: 8,
    };
    const result = calculateRetirementPlan(input);

    const expectedMonthlyExpenseAtRetirement = 50_000 * Math.pow(1.06, 30);
    expect(result.monthlyExpenseAtRetirement).toBeCloseTo(expectedMonthlyExpenseAtRetirement, 0);

    const realRate = (1.08 / 1.06) - 1;
    const annualExpense = expectedMonthlyExpenseAtRetirement * 12;
    const expectedCorpus = (annualExpense * (1 - Math.pow(1 + realRate, -25))) / realRate;
    expect(result.requiredCorpusAtRetirement).toBeCloseTo(expectedCorpus, -2); // within a rupee at this scale

    // requiredMonthlySip must equal calling requiredSipForTarget directly with the same corpus/horizon
    const expectedSip = requiredSipForTarget(result.requiredCorpusAtRetirement, 0, 12, 30 * 12);
    expect(result.requiredMonthlySip).toBeCloseTo(expectedSip as number, 6);
  });

  it("requires 0 corpus when already past life expectancy at retirement", () => {
    const result = calculateRetirementPlan({
      currentAge: 40, retirementAge: 90, lifeExpectancy: 85, // retiring after life expectancy — degenerate input
      currentMonthlyExpense: 30_000, inflationPct: 6,
      preRetirementReturnPct: 10, postRetirementReturnPct: 7,
    });
    expect(result.yearsInRetirement).toBe(0);
    expect(result.requiredCorpusAtRetirement).toBe(0);
  });

  it("reduces the required SIP when there is an existing corpus", () => {
    const withoutCorpus = calculateRetirementPlan({
      currentAge: 30, retirementAge: 60, lifeExpectancy: 85,
      currentMonthlyExpense: 50_000, inflationPct: 6, preRetirementReturnPct: 12, postRetirementReturnPct: 8,
    });
    const withCorpus = calculateRetirementPlan({
      currentAge: 30, retirementAge: 60, lifeExpectancy: 85,
      currentMonthlyExpense: 50_000, inflationPct: 6, preRetirementReturnPct: 12, postRetirementReturnPct: 8,
      existingCorpus: 5_000_000,
    });
    expect(withCorpus.requiredMonthlySip as number).toBeLessThan(withoutCorpus.requiredMonthlySip as number);
  });
});
