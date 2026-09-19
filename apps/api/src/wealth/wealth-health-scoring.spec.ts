import {
  healthLevel,
  diversificationHealth,
  riskCompositeHealth,
  savingsRateHealth,
  taxEfficiencyHealth,
  goalProgressHealth,
  insuranceAdequacyHealth,
  overallWealthHealthScore,
  isInsufficientWealthHealthSubScore,
  WEALTH_HEALTH_WEIGHTS,
  type AnyWealthHealthSubScore,
} from "./wealth-health-scoring";

describe("healthLevel", () => {
  // Reference thresholds, independently stated (not derived from the
  // function under test): <40 critical, [40,60) needsAttention, [60,80) good, >=80 excellent.
  it.each([
    [0, "critical"],
    [39.999, "critical"],
    [40, "needsAttention"],
    [59.999, "needsAttention"],
    [60, "good"],
    [79.999, "good"],
    [80, "excellent"],
    [100, "excellent"],
  ] as const)("healthLevel(%f) === %s", (score, expected) => {
    expect(healthLevel(score)).toBe(expected);
  });
});

describe("diversificationHealth", () => {
  it("passes the input score straight through, unmodified", () => {
    const result = diversificationHealth({ overallDiversificationScore: 72 });
    expect(result.score).toBe(72);
    expect(result.level).toBe("good");
  });

  it("clamps out-of-range inputs to [0, 100]", () => {
    expect(diversificationHealth({ overallDiversificationScore: 150 }).score).toBe(100);
    expect(diversificationHealth({ overallDiversificationScore: -10 }).score).toBe(0);
  });
});

describe("riskCompositeHealth", () => {
  it("inverts the Phase 12 risk score (100 - overallRiskScore)", () => {
    const result = riskCompositeHealth({ overallRiskScore: 30 });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(false);
    if (!isInsufficientWealthHealthSubScore(result)) {
      expect(result.score).toBe(70);
      expect(result.level).toBe("good");
    }
  });

  it("returns insufficientData when the risk profile itself is unavailable", () => {
    const result = riskCompositeHealth({ overallRiskScore: null });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(true);
  });
});

describe("savingsRateHealth", () => {
  it("scores 100 at exactly the 20% savings-rate target", () => {
    const result = savingsRateHealth({ monthlyIncome: 100_000, avgMonthlyExpense: 80_000 });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(false);
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBeCloseTo(100, 6);
  });

  it("scores 50 at a 10% savings rate — hand-computed: (10/20)*100", () => {
    const result = savingsRateHealth({ monthlyIncome: 100_000, avgMonthlyExpense: 90_000 });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBeCloseTo(50, 6);
  });

  it("floors at 0 when expenses meet or exceed income", () => {
    const result = savingsRateHealth({ monthlyIncome: 100_000, avgMonthlyExpense: 120_000 });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBe(0);
  });

  it("returns insufficientData with no recorded income", () => {
    const result = savingsRateHealth({ monthlyIncome: 0, avgMonthlyExpense: 5000 });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(true);
  });

  it("returns insufficientData with no expense history", () => {
    const result = savingsRateHealth({ monthlyIncome: 100_000, avgMonthlyExpense: null });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(true);
  });
});

describe("taxEfficiencyHealth", () => {
  it("scores 100 with zero harvestable loss", () => {
    const result = taxEfficiencyHealth({ totalHarvestableLoss: 0, totalAssets: 1_000_000 });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBe(100);
  });

  it("scores 0 at or beyond the 10%-of-assets harvestable-loss threshold", () => {
    const result = taxEfficiencyHealth({ totalHarvestableLoss: 100_000, totalAssets: 1_000_000 });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBe(0);
  });

  it("scores 50 at a 5% harvestable-loss ratio — hand-computed: 100 - (5/10)*100", () => {
    const result = taxEfficiencyHealth({ totalHarvestableLoss: 50_000, totalAssets: 1_000_000 });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBeCloseTo(50, 6);
  });

  it("returns insufficientData with zero total assets", () => {
    const result = taxEfficiencyHealth({ totalHarvestableLoss: 0, totalAssets: 0 });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(true);
  });
});

describe("goalProgressHealth", () => {
  it("averages percentComplete across all active goals", () => {
    const result = goalProgressHealth({ goalPercentCompletes: [20, 60, 100] });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBeCloseTo(60, 6);
  });

  it("returns insufficientData with zero active goals", () => {
    const result = goalProgressHealth({ goalPercentCompletes: [] });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(true);
  });
});

describe("insuranceAdequacyHealth", () => {
  it("scores 100 at or beyond 10x annual income coverage", () => {
    const result = insuranceAdequacyHealth({ insuranceValue: 1_000_000, annualIncome: 100_000 });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBe(100);
  });

  it("scores 50 at 5x annual income coverage — hand-computed: (500000/1000000)*100", () => {
    const result = insuranceAdequacyHealth({ insuranceValue: 500_000, annualIncome: 100_000 });
    if (!isInsufficientWealthHealthSubScore(result)) expect(result.score).toBeCloseTo(50, 6);
  });

  it("returns insufficientData with no recorded income", () => {
    const result = insuranceAdequacyHealth({ insuranceValue: 500_000, annualIncome: 0 });
    expect(isInsufficientWealthHealthSubScore(result)).toBe(true);
  });
});

describe("overallWealthHealthScore", () => {
  it("is independently reproducible from a fixed synthetic input set (acceptance criterion)", () => {
    // A fixed, fully-specified synthetic portfolio — every sub-score
    // deterministic, no insufficientData, so the whole composite can be
    // hand-computed independently of the code under test and compared exactly.
    const subScores: AnyWealthHealthSubScore[] = [
      diversificationHealth({ overallDiversificationScore: 80 }), // score 80
      riskCompositeHealth({ overallRiskScore: 40 }) as AnyWealthHealthSubScore, // score 60
      savingsRateHealth({ monthlyIncome: 100_000, avgMonthlyExpense: 80_000 }) as AnyWealthHealthSubScore, // score 100
      taxEfficiencyHealth({ totalHarvestableLoss: 50_000, totalAssets: 1_000_000 }) as AnyWealthHealthSubScore, // score 50
      goalProgressHealth({ goalPercentCompletes: [40, 60] }) as AnyWealthHealthSubScore, // score 50
      insuranceAdequacyHealth({ insuranceValue: 500_000, annualIncome: 100_000 }) as AnyWealthHealthSubScore, // score 50
    ];

    // Hand-computed weighted average, straight from WEALTH_HEALTH_WEIGHTS —
    // NOT calling overallWealthHealthScore to derive the expectation.
    const expected =
      (80 * WEALTH_HEALTH_WEIGHTS.diversification +
        60 * WEALTH_HEALTH_WEIGHTS.risk +
        100 * WEALTH_HEALTH_WEIGHTS.savingsRate +
        50 * WEALTH_HEALTH_WEIGHTS.taxEfficiency +
        50 * WEALTH_HEALTH_WEIGHTS.goalProgress +
        50 * WEALTH_HEALTH_WEIGHTS.insurance) /
      100;

    const result1 = overallWealthHealthScore(subScores);
    const result2 = overallWealthHealthScore(subScores); // re-run: same inputs -> exactly the same output, every time
    expect(result1).toBeCloseTo(expected, 10);
    expect(result2).toBe(result1);
  });

  it("excludes insufficientData dimensions and renormalizes the remaining weights proportionally", () => {
    const subScores: AnyWealthHealthSubScore[] = [
      diversificationHealth({ overallDiversificationScore: 80 }), // score 80, weight 20
      riskCompositeHealth({ overallRiskScore: null }) as AnyWealthHealthSubScore, // insufficientData -> excluded
      savingsRateHealth({ monthlyIncome: 0, avgMonthlyExpense: null }) as AnyWealthHealthSubScore, // insufficientData -> excluded
      taxEfficiencyHealth({ totalHarvestableLoss: 0, totalAssets: 0 }) as AnyWealthHealthSubScore, // insufficientData -> excluded
      goalProgressHealth({ goalPercentCompletes: [] }) as AnyWealthHealthSubScore, // insufficientData -> excluded
      insuranceAdequacyHealth({ insuranceValue: 0, annualIncome: 0 }) as AnyWealthHealthSubScore, // insufficientData -> excluded
    ];
    // Only diversification (weight 20) survives -> renormalized weight is 100% of it -> overall score == its own score.
    expect(overallWealthHealthScore(subScores)).toBeCloseTo(80, 10);
  });

  it("returns null when every dimension is insufficientData, never 0", () => {
    const subScores: AnyWealthHealthSubScore[] = [
      riskCompositeHealth({ overallRiskScore: null }) as AnyWealthHealthSubScore,
      savingsRateHealth({ monthlyIncome: 0, avgMonthlyExpense: null }) as AnyWealthHealthSubScore,
      taxEfficiencyHealth({ totalHarvestableLoss: 0, totalAssets: 0 }) as AnyWealthHealthSubScore,
      goalProgressHealth({ goalPercentCompletes: [] }) as AnyWealthHealthSubScore,
      insuranceAdequacyHealth({ insuranceValue: 0, annualIncome: 0 }) as AnyWealthHealthSubScore,
    ];
    expect(overallWealthHealthScore(subScores)).toBeNull();
  });
});
