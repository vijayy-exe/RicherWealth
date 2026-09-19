/**
 * SuggestionEngineService — AC3 ("Suggestion cards each link back to the
 * specific data — holding, ratio, threshold — that triggered them"). Fully
 * mocked (Prisma/Analytics/Harvesting/Goals/Orchestrator) — pure rule-logic
 * verification, matching this repo's dominant unit-test style (see
 * goals.service.spec.ts). No live infra needed: every suggestion is
 * triggered by a real threshold check against already-real Phase 11/13/15
 * data, so what's actually under test here is the rule logic and the
 * dataPoint traceability, not those upstream services themselves.
 */
import { SuggestionEngineService } from "./suggestion-engine.service";

describe("SuggestionEngineService", () => {
  const mockPrisma = {
    aiSuggestion: { create: jest.fn() },
    stockHolding: { findMany: jest.fn().mockResolvedValue([]) },
    mutualFundHolding: { findMany: jest.fn() },
    fundCategoryBenchmark: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const mockAnalytics = { getAllocation: jest.fn() };
  const mockHarvesting = { getHarvestCandidates: jest.fn().mockResolvedValue([]) };
  const mockGoals = { findAll: jest.fn().mockResolvedValue([]), getSuccessProbability: jest.fn() };
  const mockLiabilities = { getPortfolioSummary: jest.fn() };
  const mockNetWorth = { getAssetGrowthRate: jest.fn() };
  const mockNotifications = { notifyOnce: jest.fn() };
  const mockOrchestrator = { complete: jest.fn() };
  const mockDividendTax = { getDividendSummary: jest.fn() };

  let service: SuggestionEngineService;

  function makeService(prisma: unknown = mockPrisma) {
    return new SuggestionEngineService(
      prisma as never,
      mockAnalytics as never,
      mockHarvesting as never,
      mockGoals as never,
      mockLiabilities as never,
      mockNetWorth as never,
      mockNotifications as never,
      mockOrchestrator as never,
      mockDividendTax as never,
    );
  }

  // A benchmark lookup keyed the same way the real FundCategoryBenchmark
  // table is (unique on `category`) -- tests set entries directly rather
  // than going through onModuleInit's seeding.
  const BENCHMARKS: Record<string, { typicalExpenseRatioPct: string; typicalDividendYieldPct: string; exampleLowCostTicker: string | null }> = {
    "Large Cap Equity": { typicalExpenseRatioPct: "1.0", typicalDividendYieldPct: "1.2", exampleLowCostTicker: "UTI_NIFTY_INDEX_DIRECT" },
    "Debt / Income Fund": { typicalExpenseRatioPct: "0.6", typicalDividendYieldPct: "5.5", exampleLowCostTicker: "ICICI_SHORT_TERM_DIRECT" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.aiSuggestion.create.mockResolvedValue({ id: "suggestion-1" });
    mockPrisma.stockHolding.findMany.mockResolvedValue([]);
    mockPrisma.mutualFundHolding.findMany.mockResolvedValue([]);
    mockPrisma.fundCategoryBenchmark.findUnique.mockImplementation(({ where: { category } }: { where: { category: string } }) =>
      Promise.resolve(BENCHMARKS[category] ?? null),
    );
    mockPrisma.fundCategoryBenchmark.upsert.mockResolvedValue({});
    mockAnalytics.getAllocation.mockResolvedValue({ byDimension: { assetClass: { groups: [] } }, totalValue: 0 });
    mockHarvesting.getHarvestCandidates.mockResolvedValue([]);
    mockGoals.findAll.mockResolvedValue([]);
    // No debt, no growth by default -- checkDebtVsInvestment stays silent unless a test opts in.
    mockLiabilities.getPortfolioSummary.mockResolvedValue(null);
    mockNetWorth.getAssetGrowthRate.mockResolvedValue({ pctChange: 0, absChange: 0, fromValue: 0, toValue: 0 });
    mockNotifications.notifyOnce.mockResolvedValue({ created: true, notificationId: "notif-1" });
    mockDividendTax.getDividendSummary.mockResolvedValue({ records: [] });
    // Rules-generated description is used verbatim unless overridden per-test.
    mockOrchestrator.complete.mockResolvedValue({ text: "", modelUsed: "mock" });
    service = makeService();
  });

  describe("checkConcentration — asset-class bucket", () => {
    it("flags a REBALANCE suggestion with the exact triggering percentage/threshold when a bucket is >= 40%", async () => {
      mockAnalytics.getAllocation.mockResolvedValue({
        byDimension: { assetClass: { groups: [{ label: "Crypto", value: 45000, weight: 0.45 }] } },
        totalValue: 100000,
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "REBALANCE",
            dataPoint: expect.objectContaining({
              dimension: "assetClass",
              category: "Crypto",
              percentage: 45,
              value: 45000,
              threshold: 40,
            }),
          }),
        }),
      );
    });

    it("does not flag a bucket under the 40% threshold", async () => {
      mockAnalytics.getAllocation.mockResolvedValue({
        byDimension: { assetClass: { groups: [{ label: "Crypto", value: 10000, weight: 0.1 }] } },
        totalValue: 100000,
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "REBALANCE" }) }),
      );
    });
  });

  describe("checkConcentration — single holding", () => {
    it("flags a SELL suggestion with the exact ticker/percentage/threshold when one holding is >= 25% of net worth", async () => {
      mockAnalytics.getAllocation.mockResolvedValue({ byDimension: { assetClass: { groups: [] } }, totalValue: 100000 });
      mockPrisma.stockHolding.findMany.mockResolvedValue([
        { id: "holding-1", ticker: "AAPL", asset: { currentValue: { toString: () => "30000" } } },
      ]);

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "SELL",
            dataPoint: expect.objectContaining({ ticker: "AAPL", holdingId: "holding-1", value: 30000, percentage: 30, threshold: 25 }),
          }),
        }),
      );
    });

    it("regression: does not crash the whole run when getAllocation rejects (e.g. the quant microservice is unreachable) -- degrades to skipping concentration checks only, matching checkHarvesting/checkGoalProbability's existing resilience", async () => {
      // Found live 2026-09-07: apps/quant wasn't running, getAllocation threw
      // ECONNREFUSED uncaught, and generateForUser threw before ever calling
      // prisma.aiSuggestion.create -- silently producing zero suggestions
      // with no visible error, even though checkHarvesting/checkGoalProbability
      // had nothing to do with the quant service and could have succeeded.
      mockAnalytics.getAllocation.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:8000"));
      mockHarvesting.getHarvestCandidates.mockResolvedValue([
        {
          lot: { id: "lot-1", ticker: "TSLA", displayName: "Tesla" },
          currentValue: 4000, costBasisTotal: 5000, unrealizedLoss: -1000, unrealizedLossPct: -20,
          offsettableRealizedGain: 800, estimatedTaxSaving: 200,
        },
      ]);

      const result = await service.generateForUser("user-1");

      // The unrelated TAX_HARVEST suggestion still gets created -- proves
      // the failure was contained to checkConcentration, not fatal to the run.
      expect(result.created).toBe(1);
      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "TAX_HARVEST" }) }),
      );
      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "REBALANCE" }) }),
      );
    });
  });

  describe("checkHarvesting", () => {
    it("flags TAX_HARVEST with the exact loss/tax-saving data point when the loss is above the trivial-loss filter", async () => {
      mockHarvesting.getHarvestCandidates.mockResolvedValue([
        {
          lot: { id: "lot-1", ticker: "TSLA", displayName: "Tesla" },
          currentValue: 4000,
          costBasisTotal: 5000,
          unrealizedLoss: -1000,
          unrealizedLossPct: -20,
          offsettableRealizedGain: 800,
          estimatedTaxSaving: 200,
        },
      ]);

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "TAX_HARVEST",
            dataPoint: expect.objectContaining({ lotId: "lot-1", ticker: "TSLA", unrealizedLoss: -1000, estimatedTaxSaving: 200 }),
          }),
        }),
      );
    });

    it("does not flag a loss below the trivial-loss filter ($50)", async () => {
      mockHarvesting.getHarvestCandidates.mockResolvedValue([
        {
          lot: { id: "lot-2", ticker: "F", displayName: "Ford" },
          currentValue: 990,
          costBasisTotal: 1000,
          unrealizedLoss: -10,
          unrealizedLossPct: -1,
          offsettableRealizedGain: 10,
          estimatedTaxSaving: 2,
        },
      ]);

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "TAX_HARVEST" }) }),
      );
    });
  });

  describe("checkGoalProbability", () => {
    it("flags INCREASE_SIP with the exact probability/required-contribution data point when success probability is below 50%", async () => {
      mockGoals.findAll.mockResolvedValue([
        { id: "goal-1", name: "Retirement", targetAmount: 1000000, targetDate: "2050-01-01", currencyCode: "USD" },
      ]);
      mockGoals.getSuccessProbability.mockResolvedValue({
        alreadyAchieved: false,
        probabilityOfTarget: 0.3,
        contributionUsed: 500,
        requiredMonthlyContribution: 900,
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "INCREASE_SIP",
            dataPoint: expect.objectContaining({ goalId: "goal-1", probabilityOfTarget: 0.3, requiredMonthlyContribution: 900, threshold: 0.5 }),
          }),
        }),
      );
    });

    it("does not flag a goal with success probability at or above 50%", async () => {
      mockGoals.findAll.mockResolvedValue([{ id: "goal-2", name: "House", targetAmount: 500000, targetDate: "2040-01-01", currencyCode: "USD" }]);
      mockGoals.getSuccessProbability.mockResolvedValue({ alreadyAchieved: false, probabilityOfTarget: 0.8, contributionUsed: 500, requiredMonthlyContribution: 400 });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "INCREASE_SIP" }) }),
      );
    });
  });

  describe("checkDebtVsInvestment", () => {
    it("flags DEBT_COST_ALERT when debt cost exceeds the investment return, with the exact figures traced back to the source services", async () => {
      mockLiabilities.getPortfolioSummary.mockResolvedValue({ totalOutstanding: 100_000, weightedInterestRate: 12 });
      mockNetWorth.getAssetGrowthRate.mockResolvedValue({ pctChange: 7, absChange: 7000, fromValue: 100_000, toValue: 107_000 });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "DEBT_COST_ALERT",
            dataPoint: expect.objectContaining({ debtCostPct: 12, totalOutstanding: 100_000, investmentReturnPct: 7, debtCostExceedsInvestmentReturns: true }),
          }),
        }),
      );
    });

    it("does not flag when investment returns meet or exceed debt cost", async () => {
      mockLiabilities.getPortfolioSummary.mockResolvedValue({ totalOutstanding: 100_000, weightedInterestRate: 5 });
      mockNetWorth.getAssetGrowthRate.mockResolvedValue({ pctChange: 10, absChange: 10_000, fromValue: 100_000, toValue: 110_000 });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "DEBT_COST_ALERT" }) }),
      );
    });

    it("does not flag when there is no outstanding debt at all", async () => {
      mockLiabilities.getPortfolioSummary.mockResolvedValue(null);
      mockNetWorth.getAssetGrowthRate.mockResolvedValue({ pctChange: -5, absChange: -5000, fromValue: 100_000, toValue: 95_000 });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "DEBT_COST_ALERT" }) }),
      );
    });

    it("triggers a CFO-tier notification (via notifyOnce) when a DEBT_COST_ALERT is newly created", async () => {
      mockLiabilities.getPortfolioSummary.mockResolvedValue({ totalOutstanding: 100_000, weightedInterestRate: 12 });
      mockNetWorth.getAssetGrowthRate.mockResolvedValue({ pctChange: 7, absChange: 7000, fromValue: 100_000, toValue: 107_000 });

      await service.generateForUser("user-1");

      expect(mockNotifications.notifyOnce).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", type: "AI_INSIGHT", sourceEntityId: "suggestion-1" }),
      );
    });

    it("does NOT notify for a non-CFO-tier suggestion (e.g. REBALANCE)", async () => {
      mockAnalytics.getAllocation.mockResolvedValue({
        byDimension: { assetClass: { groups: [{ label: "Crypto", value: 45000, weight: 0.45 }] } },
        totalValue: 100000,
      });

      await service.generateForUser("user-1");

      expect(mockNotifications.notifyOnce).not.toHaveBeenCalled();
    });
  });

  describe("checkRetirementAcceleration", () => {
    function baseRetirementGoal(overrides: Record<string, unknown> = {}) {
      return {
        id: "goal-retire-1",
        name: "Retire at 55",
        type: "RETIREMENT",
        targetAmount: { toString: () => "10000000" },
        currentProgress: 2_000_000,
        percentComplete: 20,
        ...overrides,
      };
    }

    it("flags RETIREMENT_ACCELERATION when boosting the required SIP by ₹5,000/month meaningfully shortens the timeline", async () => {
      mockGoals.findAll.mockResolvedValue([baseRetirementGoal()]);
      mockGoals.getSuccessProbability.mockResolvedValue({
        alreadyAchieved: false,
        monthsRemaining: 240,
        requiredMonthlyContribution: 20_000,
        contributionUsed: 20_000,
        probabilityOfTarget: 0.6,
        isAssumedReturn: false,
        assumedAnnualReturnPct: 10,
        assumedAnnualVolatilityPct: 12,
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "RETIREMENT_ACCELERATION",
            dataPoint: expect.objectContaining({ goalId: "goal-retire-1", boostAmount: 5000, currentRequiredContribution: 20_000, boostedContribution: 25_000 }),
          }),
        }),
      );
    });

    it("ignores non-RETIREMENT goals entirely", async () => {
      mockGoals.findAll.mockResolvedValue([baseRetirementGoal({ id: "goal-vacation", type: "VACATION" })]);
      mockGoals.getSuccessProbability.mockResolvedValue({
        alreadyAchieved: false, monthsRemaining: 240, requiredMonthlyContribution: 20_000, contributionUsed: 20_000,
        probabilityOfTarget: 0.6, isAssumedReturn: false, assumedAnnualReturnPct: 10, assumedAnnualVolatilityPct: 12,
      });

      await service.generateForUser("user-1");

      // checkGoalProbability (pre-existing, type-agnostic) still runs
      // getSuccessProbability for every goal -- what's under test here is
      // that the RETIREMENT-only checkRetirementAcceleration doesn't act on it.
      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "RETIREMENT_ACCELERATION" }) }),
      );
    });

    it("skips a goal that's already achieved", async () => {
      mockGoals.findAll.mockResolvedValue([baseRetirementGoal()]);
      mockGoals.getSuccessProbability.mockResolvedValue({ alreadyAchieved: true, monthsRemaining: 0, requiredMonthlyContribution: 0, contributionUsed: 0, probabilityOfTarget: 1, isAssumedReturn: false, assumedAnnualReturnPct: 0, assumedAnnualVolatilityPct: 0 });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "RETIREMENT_ACCELERATION" }) }),
      );
    });

    it("skips when the required contribution is already 0 (nothing to boost from)", async () => {
      mockGoals.findAll.mockResolvedValue([baseRetirementGoal()]);
      mockGoals.getSuccessProbability.mockResolvedValue({
        alreadyAchieved: false, monthsRemaining: 12, requiredMonthlyContribution: 0, contributionUsed: 0,
        probabilityOfTarget: 1, isAssumedReturn: false, assumedAnnualReturnPct: 10, assumedAnnualVolatilityPct: 12,
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "RETIREMENT_ACCELERATION" }) }),
      );
    });

    it("does not flag when the timeline saved falls below the 3-month materiality floor (a goal with a very short remaining horizon)", async () => {
      mockGoals.findAll.mockResolvedValue([baseRetirementGoal({ currentProgress: 9_900_000 })]);
      mockGoals.getSuccessProbability.mockResolvedValue({
        alreadyAchieved: false, monthsRemaining: 2, requiredMonthlyContribution: 50_000, contributionUsed: 50_000,
        probabilityOfTarget: 0.9, isAssumedReturn: false, assumedAnnualReturnPct: 10, assumedAnnualVolatilityPct: 12,
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "RETIREMENT_ACCELERATION" }) }),
      );
    });
  });

  describe("checkLowFeeAlternatives", () => {
    it("flags LOW_FEE_ALTERNATIVE when a holding's expense ratio exceeds its category benchmark by the required margin", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-1", fundName: "HDFC Bluechip Fund", expenseRatio: { toString: () => "1.5" }, schemeCode: "100001" },
      ]);

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "LOW_FEE_ALTERNATIVE",
            dataPoint: expect.objectContaining({ holdingId: "mf-1", category: "Large Cap Equity", actualExpenseRatio: 1.5, benchmarkExpenseRatio: 1.0 }),
          }),
        }),
      );
    });

    it("does not flag a holding within the margin of its category benchmark", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-2", fundName: "HDFC Bluechip Fund", expenseRatio: { toString: () => "1.05" }, schemeCode: "100002" },
      ]);

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "LOW_FEE_ALTERNATIVE" }) }),
      );
    });

    it("skips a holding with no recorded expense ratio", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-3", fundName: "HDFC Bluechip Fund", expenseRatio: null, schemeCode: "100003" },
      ]);

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "LOW_FEE_ALTERNATIVE" }) }),
      );
    });

    it("skips a fund name that matches no known category, rather than guessing", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-4", fundName: "Some Obscure Thematic Fund", expenseRatio: { toString: () => "5.0" }, schemeCode: "100004" },
      ]);

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "LOW_FEE_ALTERNATIVE" }) }),
      );
    });
  });

  describe("checkDividendOpportunities", () => {
    it("flags DIVIDEND_OPPORTUNITY for an income-oriented fund whose real trailing yield falls meaningfully short of its category benchmark", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-5", fundName: "HDFC Short Duration Debt Fund", schemeCode: "200001", expenseRatio: null, asset: { currentValue: { toString: () => "1000000" } } },
      ]);
      // 1% trailing yield (10,000 / 1,000,000) vs. a 5.5% category benchmark -- a 4.5pt gap, well above the 1pt floor.
      mockDividendTax.getDividendSummary.mockResolvedValue({
        records: [{ id: "inc-1", ticker: "200001", displayName: "HDFC Short Duration Debt Fund", holdingType: "MUTUAL_FUND", amount: 10_000, currencyCode: "INR", receivedAt: "2026-01-01" }],
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "DIVIDEND_OPPORTUNITY",
            dataPoint: expect.objectContaining({ holdingId: "mf-5", category: "Debt / Income Fund", trailingDividends: 10_000 }),
          }),
        }),
      );
    });

    it("does not flag a growth-oriented category (below the income-oriented yield threshold) even with zero dividends", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-6", fundName: "HDFC Bluechip Fund", schemeCode: "100001", expenseRatio: null, asset: { currentValue: { toString: () => "1000000" } } },
      ]);
      mockDividendTax.getDividendSummary.mockResolvedValue({ records: [] });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "DIVIDEND_OPPORTUNITY" }) }),
      );
    });

    it("does not flag an income-oriented fund whose real yield is close to or above its category benchmark", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-7", fundName: "HDFC Short Duration Debt Fund", schemeCode: "200002", expenseRatio: null, asset: { currentValue: { toString: () => "1000000" } } },
      ]);
      // 5.5% trailing yield -- matches the benchmark exactly.
      mockDividendTax.getDividendSummary.mockResolvedValue({
        records: [{ id: "inc-2", ticker: "200002", displayName: "HDFC Short Duration Debt Fund", holdingType: "MUTUAL_FUND", amount: 55_000, currencyCode: "INR", receivedAt: "2026-01-01" }],
      });

      await service.generateForUser("user-1");

      expect(mockPrisma.aiSuggestion.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "DIVIDEND_OPPORTUNITY" }) }),
      );
    });

    it("continues (finding nothing) rather than failing the whole run when the dividend-summary call rejects", async () => {
      mockPrisma.mutualFundHolding.findMany.mockResolvedValue([
        { id: "mf-8", fundName: "HDFC Short Duration Debt Fund", schemeCode: "200003", expenseRatio: null, asset: { currentValue: { toString: () => "1000000" } } },
      ]);
      mockDividendTax.getDividendSummary.mockRejectedValue(new Error("db down"));

      const result = await service.generateForUser("user-1");

      expect(result.total).toBe(0);
    });
  });

  describe("onModuleInit — FundCategoryBenchmark seeding", () => {
    it("upserts every curated benchmark row, keyed on category", async () => {
      await service.onModuleInit();
      expect(mockPrisma.fundCategoryBenchmark.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { category: "Large Cap Equity" } }),
      );
      expect(mockPrisma.fundCategoryBenchmark.upsert.mock.calls.length).toBeGreaterThanOrEqual(9);
    });

    it("does not throw if the upsert fails (e.g. migration not yet applied)", async () => {
      mockPrisma.fundCategoryBenchmark.upsert.mockRejectedValue(new Error("relation does not exist"));
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  it("dedupes on a unique-constraint conflict (P2002) instead of throwing, and does not count it as created", async () => {
    mockAnalytics.getAllocation.mockResolvedValue({
      byDimension: { assetClass: { groups: [{ label: "Crypto", value: 45000, weight: 0.45 }] } },
      totalValue: 100000,
    });
    mockPrisma.aiSuggestion.create.mockRejectedValue({ code: "P2002" });

    const result = await service.generateForUser("user-1");

    expect(result.created).toBe(0);
    expect(result.total).toBe(1);
  });

  it("re-throws a non-P2002 error from suggestion creation", async () => {
    mockAnalytics.getAllocation.mockResolvedValue({
      byDimension: { assetClass: { groups: [{ label: "Crypto", value: 45000, weight: 0.45 }] } },
      totalValue: 100000,
    });
    mockPrisma.aiSuggestion.create.mockRejectedValue(new Error("connection lost"));

    await expect(service.generateForUser("user-1")).rejects.toThrow("connection lost");
  });

  it("never blocks suggestion creation on an LLM outage — falls back to the rules-generated description verbatim", async () => {
    mockAnalytics.getAllocation.mockResolvedValue({
      byDimension: { assetClass: { groups: [{ label: "Crypto", value: 45000, weight: 0.45 }] } },
      totalValue: 100000,
    });
    mockOrchestrator.complete.mockRejectedValue(new Error("LLM down"));

    await service.generateForUser("user-1");

    const call = mockPrisma.aiSuggestion.create.mock.calls[0]?.[0] as { data: { description: string } };
    expect(call.data.description).toContain("Crypto makes up 45.0%");
  });

  describe("listActive / setStatus", () => {
    it("lists only ACTIVE suggestions for the given user", async () => {
      const mockFindMany = jest.fn().mockResolvedValue([{ id: "s1" }]);
      const s = makeService({ aiSuggestion: { findMany: mockFindMany, updateMany: jest.fn() } });
      await s.listActive("user-1");
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", status: "ACTIVE" } }));
    });

    it("updates status scoped to the owning user (updateMany, not update, so a mismatched user silently affects 0 rows)", async () => {
      const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const s = makeService({ aiSuggestion: { findMany: jest.fn(), updateMany: mockUpdateMany } });
      await s.setStatus("user-1", "sugg-1", "DISMISSED");
      expect(mockUpdateMany).toHaveBeenCalledWith({ where: { id: "sugg-1", userId: "user-1" }, data: { status: "DISMISSED" } });
    });
  });
});
