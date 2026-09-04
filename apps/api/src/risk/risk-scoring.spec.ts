import {
  riskLevel,
  liquidityRisk,
  debtRisk,
  inflationRisk,
  currencyRisk,
  marketRisk,
  interestRateRisk,
  creditRisk,
  overallRiskScore,
  RISK_WEIGHTS,
  type RiskSubScore,
  type InsufficientRiskSubScore,
} from "./risk-scoring";

describe("riskLevel", () => {
  // Reference thresholds, independently stated (not derived from the
  // function under test): <25 low, [25,50) moderate, [50,75) elevated, >=75 high.
  it.each([
    [0, "low"],
    [24.999, "low"],
    [25, "moderate"],
    [49.999, "moderate"],
    [50, "elevated"],
    [74.999, "elevated"],
    [75, "high"],
    [100, "high"],
  ] as const)("riskLevel(%f) === %s", (score, expected) => {
    expect(riskLevel(score)).toBe(expected);
  });
});

describe("liquidityRisk", () => {
  it("scores 0 (low) at exactly the 15% target", () => {
    const result = liquidityRisk({ cashPercent: 15 });
    expect(result.score).toBeCloseTo(0, 6);
    expect(result.level).toBe("low");
  });

  it("scores 100 (high) with zero cash", () => {
    const result = liquidityRisk({ cashPercent: 0 });
    expect(result.score).toBeCloseTo(100, 6);
    expect(result.level).toBe("high");
  });

  it("scores 33.33 (moderate) at 10% cash — hand-computed: 100*(1-10/15)", () => {
    const result = liquidityRisk({ cashPercent: 10 });
    expect(result.score).toBeCloseTo(100 * (1 - 10 / 15), 6); // = 33.333...
    expect(result.level).toBe("moderate");
  });

  it("clamps to 0 when cash exceeds the target (never negative)", () => {
    const result = liquidityRisk({ cashPercent: 40 });
    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
  });

  it("mentions the actual cash percentage in the explanation", () => {
    const result = liquidityRisk({ cashPercent: 10 });
    expect(result.explanation).toContain("10.0%");
  });
});

describe("debtRisk", () => {
  it("scores 0 (low) at zero debt", () => {
    expect(debtRisk({ debtRatio: 0 }).score).toBe(0);
  });

  it("scores 40 (moderate) at a 30% debt ratio — hand-computed: 0.3/0.75*100", () => {
    const result = debtRisk({ debtRatio: 0.3 });
    expect(result.score).toBeCloseTo((0.3 / 0.75) * 100, 6); // = 40
    expect(result.level).toBe("moderate");
  });

  it("scores ~66.67 (elevated) at a 50% debt ratio — hand-computed: 0.5/0.75*100", () => {
    const result = debtRisk({ debtRatio: 0.5 });
    expect(result.score).toBeCloseTo((0.5 / 0.75) * 100, 6); // = 66.666...
    expect(result.level).toBe("elevated");
  });

  it("caps at 100 (high) for a debt ratio at or above 75%", () => {
    expect(debtRisk({ debtRatio: 0.75 }).score).toBe(100);
    expect(debtRisk({ debtRatio: 1.5 }).score).toBe(100);
    expect(debtRisk({ debtRatio: 1.5 }).level).toBe("high");
  });
});

describe("inflationRisk", () => {
  it("scores exactly the exposed percent when inflation is at the 2% target (multiplier = 1.0)", () => {
    const result = inflationRisk({ inflationExposedPercent: 50, currentInflationPct: 2.0 });
    expect(result.score).toBeCloseTo(50, 6);
  });

  it("doubles the exposed percent at high inflation, capped at a 2.0x multiplier — hand-computed: 6%/2% clamped to 2.0", () => {
    const result = inflationRisk({ inflationExposedPercent: 50, currentInflationPct: 6.0 });
    expect(result.score).toBeCloseTo(100, 6); // 50 * min(6/2, 2.0) = 50 * 2.0 = 100
  });

  it("halves the exposed percent at very low inflation, floored at a 0.5x multiplier", () => {
    const result = inflationRisk({ inflationExposedPercent: 50, currentInflationPct: 0.5 });
    expect(result.score).toBeCloseTo(25, 6); // multiplier floored to 0.5 -> 50*0.5 = 25
  });

  it("scores 0 with no cash/bond exposure regardless of inflation", () => {
    expect(inflationRisk({ inflationExposedPercent: 0, currentInflationPct: 8 }).score).toBe(0);
  });
});

describe("currencyRisk", () => {
  it("is a direct 1:1 mapping of foreign-currency percentage to score", () => {
    const result = currencyRisk({ foreignCurrencyPercent: 60, baseCurrency: "INR", dominantForeignCurrency: "USD" });
    expect(result.score).toBe(60);
    expect(result.level).toBe("elevated");
  });

  it("reproduces the example from the feature spec verbatim", () => {
    const result = currencyRisk({ foreignCurrencyPercent: 60, baseCurrency: "INR", dominantForeignCurrency: "USD" });
    expect(result.explanation).toContain("60.0%");
    expect(result.explanation).toContain("USD");
    expect(result.explanation).toContain("INR");
  });

  it("scores 0 when fully in base currency", () => {
    const result = currencyRisk({ foreignCurrencyPercent: 0, baseCurrency: "INR", dominantForeignCurrency: null });
    expect(result.score).toBe(0);
    expect(result.level).toBe("low");
  });
});

describe("marketRisk", () => {
  it("hand-computed composite with all three components present", () => {
    // volatility 0.15 -> volScore = 0.15/0.30*100 = 50
    // beta 1.0        -> betaScore = 1.0/2.0*100 = 50
    // maxDrawdown -0.25 -> ddScore = 0.25/0.50*100 = 50
    // composite = 0.4*50 + 0.3*50 + 0.3*50 = 50
    const result = marketRisk({ volatility: 0.15, beta: 1.0, maxDrawdown: -0.25 });
    expect(result.score).toBeCloseTo(50, 6);
    expect(result.level).toBe("elevated");
  });

  it("redistributes weight across volatility+beta when drawdown is unavailable", () => {
    // volScore = 100 (0.30 vol hits the cap), betaScore = 50 (beta 1.0)
    // composite = 4/7*100 + 3/7*50 = 57.142... + 21.428... = 78.571...
    const result = marketRisk({ volatility: 0.30, beta: 1.0, maxDrawdown: null });
    expect(result.score).toBeCloseTo((4 / 7) * 100 + (3 / 7) * 50, 6);
  });

  it("caps every component at 100 for extreme single-stock-like inputs", () => {
    const result = marketRisk({ volatility: 0.60, beta: 3.0, maxDrawdown: -0.80 });
    expect(result.score).toBe(100);
    expect(result.level).toBe("high");
  });

  it("scores near 0 for a low-volatility, low-beta, shallow-drawdown portfolio", () => {
    const result = marketRisk({ volatility: 0.01, beta: 0.1, maxDrawdown: -0.01 });
    expect(result.score).toBeLessThan(10);
    expect(result.level).toBe("low");
  });
});

describe("interestRateRisk", () => {
  it("hand-computed: 60% variable-debt weight + 40% macro-rate weight", () => {
    // variableDebtPercent 50 -> used directly: 50
    // currentShortRatePct 4 -> macroScore = 4/8*100 = 50
    // composite = 0.6*50 + 0.4*50 = 50
    const result = interestRateRisk({ variableDebtPercent: 50, currentShortRatePct: 4 });
    expect(result.score).toBeCloseTo(50, 6);
  });

  it("scores 0 with no variable debt and a 0% short rate", () => {
    expect(interestRateRisk({ variableDebtPercent: 0, currentShortRatePct: 0 }).score).toBe(0);
  });

  it("caps the macro component at an 8% short rate", () => {
    const result = interestRateRisk({ variableDebtPercent: 0, currentShortRatePct: 20 });
    expect(result.score).toBeCloseTo(40, 6); // 0.6*0 + 0.4*100
  });
});

describe("creditRisk", () => {
  it("hand-computed: 25% exposure hits the 100 cap", () => {
    expect(creditRisk({ creditExposedPercent: 25 }).score).toBe(100);
  });

  it("scores proportionally below the cap", () => {
    const result = creditRisk({ creditExposedPercent: 12.5 });
    expect(result.score).toBeCloseTo(50, 6); // 12.5/25*100
  });

  it("scores 0 with no credit-risk-bearing holdings", () => {
    expect(creditRisk({ creditExposedPercent: 0 }).score).toBe(0);
  });
});

describe("overallRiskScore", () => {
  it("returns a straight weighted average when every sub-score is available", () => {
    const subScores: RiskSubScore[] = [
      liquidityRisk({ cashPercent: 0 }), // 100
      debtRisk({ debtRatio: 0 }), // 0
      inflationRisk({ inflationExposedPercent: 0, currentInflationPct: 2 }), // 0
      currencyRisk({ foreignCurrencyPercent: 0, baseCurrency: "INR", dominantForeignCurrency: null }), // 0
      marketRisk({ volatility: 0, beta: 0, maxDrawdown: 0 }), // 0
      interestRateRisk({ variableDebtPercent: 0, currentShortRatePct: 0 }), // 0
      creditRisk({ creditExposedPercent: 0 }), // 0
    ];
    // Only liquidity (weight 15) is non-zero, at 100: weighted avg = 100*15 / 100 = 15
    const totalWeight = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(totalWeight).toBe(100);
    expect(overallRiskScore(subScores)).toBeCloseTo(15, 6);
  });

  it("renormalizes weights when a sub-score is insufficientData, rather than treating it as 0 risk", () => {
    const marketInsufficient: InsufficientRiskSubScore = { key: "market", label: "Market Risk", insufficientData: true, reason: "not enough history" };
    const subScores = [
      liquidityRisk({ cashPercent: 0 }), // 100, weight 15
      debtRisk({ debtRatio: 0 }), // 0, weight 20
      inflationRisk({ inflationExposedPercent: 0, currentInflationPct: 2 }), // 0, weight 10
      currencyRisk({ foreignCurrencyPercent: 0, baseCurrency: "INR", dominantForeignCurrency: null }), // 0, weight 10
      marketInsufficient, // dropped entirely
      interestRateRisk({ variableDebtPercent: 0, currentShortRatePct: 0 }), // 0, weight 5
      creditRisk({ creditExposedPercent: 0 }), // 0, weight 15
    ];
    // Remaining weight total = 100 - 25 (market) = 75. weighted sum = 100*15 = 1500. 1500/75 = 20.
    expect(overallRiskScore(subScores)).toBeCloseTo(20, 6);
  });

  it("returns null when every sub-score is insufficientData", () => {
    const allInsufficient: InsufficientRiskSubScore[] = (["liquidity", "debt", "inflation", "currency", "market", "interestRate", "credit"] as const).map(
      (key) => ({ key, label: key, insufficientData: true, reason: "no data" }),
    );
    expect(overallRiskScore(allInsufficient)).toBeNull();
  });
});

// ─── End-to-end synthetic portfolios (acceptance criterion) ────────────────

describe("synthetic portfolio scenarios", () => {
  it("a low-risk (mostly cash/bonds, no debt) portfolio scores low overall", () => {
    const subScores: RiskSubScore[] = [
      liquidityRisk({ cashPercent: 30 }), // well above 15% target -> 0
      debtRisk({ debtRatio: 0 }), // no debt -> 0
      inflationRisk({ inflationExposedPercent: 70, currentInflationPct: 2.0 }), // at target -> 70
      currencyRisk({ foreignCurrencyPercent: 5, baseCurrency: "INR", dominantForeignCurrency: "USD" }),
      marketRisk({ volatility: 0.03, beta: 0.2, maxDrawdown: -0.02 }),
      interestRateRisk({ variableDebtPercent: 0, currentShortRatePct: 4.5 }),
      creditRisk({ creditExposedPercent: 0 }), // all govt bonds -> 0
    ];
    const overall = overallRiskScore(subScores);
    expect(overall).not.toBeNull();
    expect(overall as number).toBeLessThan(40);
  });

  it("a high-risk (concentrated single-stock, high debt) portfolio scores high overall", () => {
    const subScores: RiskSubScore[] = [
      liquidityRisk({ cashPercent: 0 }), // no cash -> 100
      debtRisk({ debtRatio: 0.8 }), // heavily levered -> 100 (capped)
      inflationRisk({ inflationExposedPercent: 0, currentInflationPct: 5 }), // no cash/bonds -> 0
      currencyRisk({ foreignCurrencyPercent: 100, baseCurrency: "INR", dominantForeignCurrency: "USD" }), // single foreign stock -> 100
      marketRisk({ volatility: 0.55, beta: 2.5, maxDrawdown: -0.60 }), // concentrated single stock -> 100 (capped)
      interestRateRisk({ variableDebtPercent: 90, currentShortRatePct: 6 }),
      creditRisk({ creditExposedPercent: 0 }), // no bonds/p2p at all -> 0
    ];
    const overall = overallRiskScore(subScores);
    expect(overall).not.toBeNull();
    expect(overall as number).toBeGreaterThan(60);
  });

  it("the high-risk portfolio scores strictly higher than the low-risk portfolio", () => {
    const low = overallRiskScore([
      liquidityRisk({ cashPercent: 30 }),
      debtRisk({ debtRatio: 0 }),
      inflationRisk({ inflationExposedPercent: 70, currentInflationPct: 2.0 }),
      currencyRisk({ foreignCurrencyPercent: 5, baseCurrency: "INR", dominantForeignCurrency: "USD" }),
      marketRisk({ volatility: 0.03, beta: 0.2, maxDrawdown: -0.02 }),
      interestRateRisk({ variableDebtPercent: 0, currentShortRatePct: 4.5 }),
      creditRisk({ creditExposedPercent: 0 }),
    ]) as number;
    const high = overallRiskScore([
      liquidityRisk({ cashPercent: 0 }),
      debtRisk({ debtRatio: 0.8 }),
      inflationRisk({ inflationExposedPercent: 0, currentInflationPct: 5 }),
      currencyRisk({ foreignCurrencyPercent: 100, baseCurrency: "INR", dominantForeignCurrency: "USD" }),
      marketRisk({ volatility: 0.55, beta: 2.5, maxDrawdown: -0.60 }),
      interestRateRisk({ variableDebtPercent: 90, currentShortRatePct: 6 }),
      creditRisk({ creditExposedPercent: 0 }),
    ]) as number;
    expect(high).toBeGreaterThan(low);
  });
});
