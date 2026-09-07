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
  };
  const mockAnalytics = { getAllocation: jest.fn() };
  const mockHarvesting = { getHarvestCandidates: jest.fn().mockResolvedValue([]) };
  const mockGoals = { findAll: jest.fn().mockResolvedValue([]), getSuccessProbability: jest.fn() };
  const mockOrchestrator = { complete: jest.fn() };

  let service: SuggestionEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.aiSuggestion.create.mockResolvedValue({});
    mockPrisma.stockHolding.findMany.mockResolvedValue([]);
    mockAnalytics.getAllocation.mockResolvedValue({ byDimension: { assetClass: { groups: [] } }, totalValue: 0 });
    mockHarvesting.getHarvestCandidates.mockResolvedValue([]);
    mockGoals.findAll.mockResolvedValue([]);
    // Rules-generated description is used verbatim unless overridden per-test.
    mockOrchestrator.complete.mockResolvedValue({ text: "", modelUsed: "mock" });
    service = new SuggestionEngineService(
      mockPrisma as never,
      mockAnalytics as never,
      mockHarvesting as never,
      mockGoals as never,
      mockOrchestrator as never,
    );
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
      const s = new SuggestionEngineService({ aiSuggestion: { findMany: mockFindMany, updateMany: jest.fn() } } as never, mockAnalytics as never, mockHarvesting as never, mockGoals as never, mockOrchestrator as never);
      await s.listActive("user-1");
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", status: "ACTIVE" } }));
    });

    it("updates status scoped to the owning user (updateMany, not update, so a mismatched user silently affects 0 rows)", async () => {
      const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const s = new SuggestionEngineService({ aiSuggestion: { findMany: jest.fn(), updateMany: mockUpdateMany } } as never, mockAnalytics as never, mockHarvesting as never, mockGoals as never, mockOrchestrator as never);
      await s.setStatus("user-1", "sugg-1", "DISMISSED");
      expect(mockUpdateMany).toHaveBeenCalledWith({ where: { id: "sugg-1", userId: "user-1" }, data: { status: "DISMISSED" } });
    });
  });
});
