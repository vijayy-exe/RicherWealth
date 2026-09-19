import { classifyWealthDna, type WealthDnaSignals } from "./wealth-dna-classifier";

function baseSignals(overrides: Partial<WealthDnaSignals> = {}): WealthDnaSignals {
  return {
    overallRiskScore: null,
    debtRiskScore: null,
    savingsRatePct: null,
    passiveIncomeSharePct: null,
    avgGoalAggressiveness: null,
    ...overrides,
  };
}

describe("classifyWealthDna", () => {
  it("returns insufficientData when every signal is null", () => {
    const result = classifyWealthDna(baseSignals());
    expect(result).toMatchObject({ insufficientData: true });
  });

  it("classifies Debt-Focused Rebuilder when debt risk is at/above 60, regardless of other signals", () => {
    const result = classifyWealthDna(baseSignals({ debtRiskScore: 70, overallRiskScore: 20, savingsRatePct: 30, passiveIncomeSharePct: 50 }));
    expect(result).toMatchObject({ archetype: "Debt-Focused Rebuilder" });
  });

  it("does not classify Debt-Focused Rebuilder below the 60 threshold", () => {
    const result = classifyWealthDna(baseSignals({ debtRiskScore: 59, overallRiskScore: 50, savingsRatePct: 10 }));
    expect(result).not.toMatchObject({ archetype: "Debt-Focused Rebuilder" });
  });

  it("classifies Income Generator when passive income share is at/above 40%", () => {
    const result = classifyWealthDna(baseSignals({ passiveIncomeSharePct: 45, debtRiskScore: 10 }));
    expect(result).toMatchObject({ archetype: "Income Generator" });
  });

  it("classifies Growth Builder from high portfolio risk + high savings rate", () => {
    const result = classifyWealthDna(baseSignals({ overallRiskScore: 60, savingsRatePct: 20, debtRiskScore: 10, passiveIncomeSharePct: 5 }));
    expect(result).toMatchObject({ archetype: "Growth Builder" });
  });

  it("classifies Growth Builder from aggressive goal-funding + high savings rate, even with a moderate/unknown risk score", () => {
    const result = classifyWealthDna(baseSignals({ overallRiskScore: 40, savingsRatePct: 20, avgGoalAggressiveness: 0.35, debtRiskScore: 10 }));
    expect(result).toMatchObject({ archetype: "Growth Builder" });
  });

  it("does not classify Growth Builder from high risk alone without a high savings rate", () => {
    const result = classifyWealthDna(baseSignals({ overallRiskScore: 80, savingsRatePct: 5, debtRiskScore: 10 }));
    expect(result).not.toMatchObject({ archetype: "Growth Builder" });
  });

  it("classifies Capital Preserver from a low overall risk score", () => {
    const result = classifyWealthDna(baseSignals({ overallRiskScore: 20, debtRiskScore: 10, savingsRatePct: 5 }));
    expect(result).toMatchObject({ archetype: "Capital Preserver" });
  });

  it("falls back to Balanced Optimizer when nothing clearly dominates", () => {
    const result = classifyWealthDna(baseSignals({ overallRiskScore: 45, debtRiskScore: 20, savingsRatePct: 10, passiveIncomeSharePct: 10 }));
    expect(result).toMatchObject({ archetype: "Balanced Optimizer" });
  });

  it("falls back to Balanced Optimizer (not insufficientData) when only SOME signals are present but none crosses a threshold", () => {
    const result = classifyWealthDna(baseSignals({ overallRiskScore: 45 }));
    expect(result).toMatchObject({ archetype: "Balanced Optimizer" });
  });

  it("evaluates rules in documented priority order: Debt-Focused Rebuilder beats Income Generator", () => {
    const result = classifyWealthDna(baseSignals({ debtRiskScore: 65, passiveIncomeSharePct: 50 }));
    expect(result).toMatchObject({ archetype: "Debt-Focused Rebuilder" });
  });

  it("every non-insufficientData result includes the real signals it was computed from, for traceability", () => {
    const signals = baseSignals({ overallRiskScore: 20 });
    const result = classifyWealthDna(signals);
    expect(result.signals).toEqual(signals);
  });
});
