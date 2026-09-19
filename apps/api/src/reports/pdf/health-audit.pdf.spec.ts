import Decimal from "decimal.js";
import { buildHealthAuditPdf, type HealthAuditData } from "./health-audit.pdf";
import { extractPdfText } from "./pdf-test-utils";
import type { DashboardSummary } from "../../net-worth/net-worth.service";
import type { TaxReport } from "@richer/shared-types";

/**
 * Acceptance criterion 3: "Financial Health Audit PDF generates without
 * errors and includes real data from every referenced module, not
 * placeholder text." Proven the same way net-worth-statement.pdf.spec.ts /
 * tax-report.pdf.spec.ts prove their own acceptance criteria: construct a
 * fixture matching the EXACT shape each real upstream service returns (not
 * a simplified stand-in), render the PDF, extract its text, and assert the
 * literal figures from EVERY section appear — not re-derived, not rounded
 * differently, the actual numbers.
 */
describe("buildHealthAuditPdf", () => {
  const netWorthSummary: DashboardSummary = {
    totalNetWorth: 2_845_671.33,
    todayChangeAbs: 1200, todayChangePct: 0.04,
    monthChangeAbs: 45000, monthChangePct: 1.61,
    yearChangeAbs: 380000, yearChangePct: 15.42,
    assetAllocation: [
      { category: "STOCK", valueInBase: 1_800_000, percentage: 63.3 },
      { category: "BOND", valueInBase: 1_045_671.33, percentage: 36.7 },
    ],
    currencyExposure: [{ currency: "INR", valueInBase: 2_845_671.33, percentage: 100 }],
    emergencyFundHealth: 5.5,
    debtRatio: 0.12,
    snapshots: [],
    hasAssets: true,
    baseCurrency: "INR",
  };

  const taxReport: TaxReport = {
    generatedAt: new Date().toISOString(),
    financialYear: "2025-26",
    countryCode: "IN",
    countryName: "India",
    currency: "INR",
    capitalGains: {
      shortTerm: { totalGains: 12000, totalLosses: 3000, net: 9000, lines: [] },
      longTerm: { totalGains: 50000, totalLosses: 0, net: 50000, exemptionApplied: 0, taxableGain: 50000, lines: [] },
    },
    dividends: { totalDividendIncome: 4502.5, estimatedRatePct: 15, estimatedWithholdingTax: 675.4, records: [] },
    totalEstimatedTax: 8925.44,
    notes: [],
    hasBackfillEstimateData: false,
  };

  const retirementGoal = {
    id: "goal-1", userId: "user-1", type: "RETIREMENT", name: "Retire at 55",
    targetAmount: new Decimal(10_000_000) as never, targetDate: new Date("2050-01-01"),
    currencyCode: "INR", linkedAssetIds: [], standaloneProgressAmount: new Decimal(0) as never,
    notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    currentProgress: 2_000_000, percentComplete: 20,
  } as never;

  function buildData(overrides: Partial<HealthAuditData> = {}): HealthAuditData {
    return {
      userName: "Jamie Audit",
      baseCurrency: "INR",
      netWorthSummary,
      allocation: { totalValue: 2_845_671.33, overallDiversificationScore: 74 },
      riskProfile: {
        overallScore: 38,
        subScores: [
          { key: "market", label: "Market Risk", score: 42, level: "moderate", explanation: "Market risk explanation text." },
          { key: "debt", label: "Debt Risk", score: 16, level: "low", explanation: "Debt risk explanation text." },
        ],
        computedAt: new Date().toISOString(),
        cached: false,
      },
      wealthHealth: {
        overallScore: 71,
        subScores: [
          { key: "diversification", label: "Diversification", score: 74, level: "good", explanation: "Diversification explanation." },
          { key: "insurance", label: "Insurance Adequacy", score: 63, level: "good", explanation: "Insurance coverage is 63% of the 10x-income target." },
        ],
        computedAt: new Date().toISOString(),
        cached: false,
      },
      wealthDna: {
        archetype: "Growth Builder",
        narrative: "This user is actively building wealth through above-average risk-taking and a strong savings rate.",
        isLLMGenerated: false,
        signals: { overallRiskScore: 38, debtRiskScore: 16, savingsRatePct: 22, passiveIncomeSharePct: 10, avgGoalAggressiveness: 0.25 },
        computedAt: new Date().toISOString(),
      },
      harvestCandidates: [
        {
          lot: {
            id: "lot-1", holdingType: "STOCK", assetId: "asset-1", ticker: "TATASTEEL", displayName: "Tata Steel",
            quantity: 100, remainingQuantity: 100, costBasisPerUnit: 150, costBasisCurrency: "INR",
            acquiredAt: new Date("2024-01-01").toISOString(), isBackfillEstimate: false, status: "OPEN",
          },
          currentPricePerUnit: 120, currentValue: 12000, costBasisTotal: 15000,
          unrealizedLoss: -3000, unrealizedLossPct: -20, offsettableRealizedGain: 2500,
          netBenefit: 900, estimatedTaxSaving: 900, potentialWashSale: false, washSaleWarning: null, isPriceStale: false,
        },
      ],
      taxReport,
      goals: [retirementGoal],
      goalProbabilities: [{ goal: retirementGoal, probabilityOfTarget: 0.65, requiredMonthlyContribution: 25_000 }] as never,
      opportunities: [
        { id: "sugg-1", type: "DEBT_COST_ALERT", title: "Your debt is costing more than your investments earn", description: "Real description text about debt cost vs investment return." },
      ],
      scenarios: [
        {
          label: "Market Crash (-30%)",
          result: {
            scenarioType: "MARKET_CRASH" as never,
            horizonMonths: 120,
            initialValue: 2_845_671.33,
            isAssumedReturn: false,
            assumedAnnualReturnPct: 10,
            assumedAnnualVolatilityPct: 14,
            baseline: { periods: 120, percentiles: {}, mean: [], finalValueStats: { mean: 5_200_000, std: 500_000, min: 1_000_000, max: 9_000_000 } },
            scenario: { periods: 120, percentiles: {}, mean: [], finalValueStats: { mean: 4_100_000, std: 600_000, min: 800_000, max: 7_500_000 } },
          },
        },
      ],
      pastState: {
        requestedDate: "2025-09-07",
        snapshotDate: "2025-09-06",
        totalAssets: 2_500_000,
        totalLiabilities: 300_000,
        netWorth: 2_200_000,
        baseCurrency: "INR",
        approximateAllocation: [{ category: "STOCK", valueInBase: 1_500_000, percentage: 60 }],
        isApproximate: true,
      },
      ...overrides,
    };
  }

  const summaries = {
    overall: { text: "Overall real executive summary text.", isPlaceholder: false },
    netWorth: { text: "Net worth section summary text.", isPlaceholder: false },
    risk: { text: "Risk section summary text.", isPlaceholder: false },
    wealthHealth: { text: "Wealth health section summary text.", isPlaceholder: false },
    goals: { text: "Goals section summary text.", isPlaceholder: false },
  };

  it("generates without errors and includes real figures from EVERY referenced module — the literal acceptance criterion", async () => {
    const pdf = await buildHealthAuditPdf(buildData(), summaries);
    expect(pdf.length).toBeGreaterThan(1000);

    const text = await extractPdfText(pdf);

    // Section 1: Net Worth
    expect(text).toContain("2,845,671.33");
    expect(text).toContain("+15.42%");

    // Section 2: Allocation
    expect(text).toContain("74"); // diversification score
    expect(text).toContain("STOCK");
    expect(text).toContain("63.3%");

    // Section 3: Risk
    expect(text).toContain("Market Risk");
    expect(text).toContain("moderate");

    // Section 4: Wealth Health
    expect(text).toContain("71"); // overall wealth health score
    expect(text).toContain("Insurance Adequacy");

    // Section 5: Wealth DNA
    expect(text).toContain("Growth Builder");
    expect(text).toContain("Wealth DNA");

    // Section 6: Tax / Harvesting
    expect(text).toContain("Tata Steel");
    expect(text).toContain("8,925.44"); // totalEstimatedTax exact

    // Section 7: Goals
    expect(text).toContain("Retire at 55");
    expect(text).toContain("20%"); // percentComplete

    // Section 8: Opportunities
    expect(text).toContain("Your debt is costing more");
    expect(text).toContain("DEBT_COST_ALERT");

    // Section 9: Scenarios
    expect(text).toContain("Market Crash");
    expect(text).toContain("4,100,000.00"); // scenario mean final value, exact

    // Section 10: Time Machine / History
    expect(text).toContain("2025-09-06");
    expect(text).toContain("2,200,000.00");

    // Section 11: Insurance
    expect(text).toContain("Insurance Adequacy");
    expect(text).toContain("63 / 100");

    // Executive summaries appear, not placeholders
    expect(text).toContain("Overall real executive summary text.");
    expect(text).not.toContain("PLACEHOLDER");
  });

  it("visibly labels a placeholder executive summary as such, never presenting it as real AI output", async () => {
    const pdf = await buildHealthAuditPdf(buildData(), { ...summaries, overall: { text: "fallback text", isPlaceholder: true } });
    const text = await extractPdfText(pdf);
    expect(text).toContain("PLACEHOLDER");
  });

  it("handles a brand-new user's total absence of data with honest empty states, never fabricated content", async () => {
    const empty = buildData({
      allocation: { totalValue: 0, overallDiversificationScore: 0 },
      riskProfile: { overallScore: null, subScores: [], computedAt: new Date().toISOString(), cached: false },
      wealthHealth: { overallScore: null, subScores: [], computedAt: new Date().toISOString(), cached: false },
      wealthDna: { insufficientData: true, reason: "Not enough financial data recorded yet.", signals: { overallRiskScore: null, debtRiskScore: null, savingsRatePct: null, passiveIncomeSharePct: null, avgGoalAggressiveness: null }, computedAt: new Date().toISOString() },
      harvestCandidates: [],
      taxReport: null,
      goals: [],
      goalProbabilities: [],
      opportunities: [],
      scenarios: [],
      pastState: { insufficientData: true, reason: "No net-worth history exists on or before this date yet." },
    });

    const pdf = await buildHealthAuditPdf(empty, summaries);
    const text = await extractPdfText(pdf);

    expect(text).toContain("Not enough data yet to");
    expect(text).toContain("compute a risk profile");
    expect(text).toContain("compute a Wealth Health");
    expect(text).toContain("Not enough financial data");
    expect(text).toContain("No tax-loss-harvesting");
    expect(text).toContain("No active goals set yet");
    expect(text).toContain("No active suggestions");
    expect(text).toContain("No scenario projections");
    expect(text).toContain("No net-worth history exists");
  });
});
