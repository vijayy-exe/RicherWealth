/**
 * WealthHealthService orchestration tests — deterministic with mocked
 * NetWorthService, AnalyticsService, RiskEngineService, IncomeService,
 * TransactionsService, HarvestingService, GoalsService, and Prisma. The
 * scoring math itself is covered independently and exactly in
 * wealth-health-scoring.spec.ts; this file verifies the ASSEMBLY layer
 * wires real-shaped upstream data into that math correctly, including
 * caching and snapshot-writing behavior (mirroring RiskEngineService's own
 * test shape).
 */
import Decimal from "decimal.js";
import { WealthHealthService } from "./wealth-health.service";
import type { NetWorthResult } from "../net-worth/net-worth.service";

describe("WealthHealthService", () => {
  const mockPrisma = {
    wealthHealthSnapshot: { upsert: jest.fn() },
  };
  const mockConfig = { get: jest.fn() };
  let memoryStore: Map<string, string>;
  const mockMemoryCache = {
    get: jest.fn((key: string) => memoryStore.get(key) ?? null),
    set: jest.fn((key: string, value: string) => memoryStore.set(key, value)),
  };
  const mockNetWorth = { calculateNetWorth: jest.fn() };
  const mockAnalytics = { getAllocation: jest.fn() };
  const mockRiskEngine = { getRiskProfile: jest.fn() };
  const mockIncome = { getMonthlyPassiveIncome: jest.fn() };
  const mockTransactions = { getAverageMonthlyExpense: jest.fn() };
  const mockHarvesting = { getHarvestCandidates: jest.fn() };
  const mockGoals = { findAll: jest.fn() };

  let service: WealthHealthService;

  function makeNetWorth(overrides: { totalAssets: number; assetAllocation: NetWorthResult["assetAllocation"] }): NetWorthResult {
    return {
      totalAssets: new Decimal(overrides.totalAssets),
      totalLiabilities: new Decimal(0),
      netWorth: new Decimal(overrides.totalAssets),
      baseCurrency: "INR",
      currencyExposure: [],
      debtRatio: 0,
      assetAllocation: overrides.assetAllocation,
    } as NetWorthResult;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryStore = new Map();
    mockConfig.get.mockImplementation((key: string) => (key === "REDIS_URL" ? "redis://127.0.0.1:1" : undefined));
    mockPrisma.wealthHealthSnapshot.upsert.mockResolvedValue({});

    service = new WealthHealthService(
      mockPrisma as never,
      mockConfig as never,
      mockMemoryCache as never,
      mockNetWorth as never,
      mockAnalytics as never,
      mockRiskEngine as never,
      mockIncome as never,
      mockTransactions as never,
      mockHarvesting as never,
      mockGoals as never,
    );
    await service.onModuleInit();
  });

  describe("a healthy portfolio (diversified, low risk, good savings rate, on-track goals, no un-harvested losses, well-insured)", () => {
    beforeEach(() => {
      mockNetWorth.calculateNetWorth.mockResolvedValue(
        makeNetWorth({
          totalAssets: 1_000_000,
          assetAllocation: [
            { category: "STOCK", valueInBase: 500_000, percentage: 50 },
            { category: "BOND", valueInBase: 400_000, percentage: 40 },
            { category: "INSURANCE", valueInBase: 1_000_000, percentage: 10 },
          ],
        }),
      );
      mockAnalytics.getAllocation.mockResolvedValue({ overallDiversificationScore: 85 });
      mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: 20, subScores: [], computedAt: "", cached: false });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 100_000, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(75_000); // 25% savings rate
      mockHarvesting.getHarvestCandidates.mockResolvedValue([]);
      mockGoals.findAll.mockResolvedValue([{ percentComplete: 80 }, { percentComplete: 90 }]);
    });

    it("produces a high overall score", async () => {
      const result = await service.getScore("user-healthy");
      expect(result.overallScore).not.toBeNull();
      expect(result.overallScore as number).toBeGreaterThan(70);
      expect(result.cached).toBe(false);
    });

    it("writes a WealthHealthSnapshot on a fresh computation", async () => {
      await service.getScore("user-healthy");
      expect(mockPrisma.wealthHealthSnapshot.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.wealthHealthSnapshot.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId_snapshotDate: expect.objectContaining({ userId: "user-healthy" }) } }),
      );
    });

    it("serves a cached result on the second call without recomputing", async () => {
      const first = await service.getScore("user-healthy");
      expect(first.cached).toBe(false);
      const second = await service.getScore("user-healthy");
      expect(second.cached).toBe(true);
      expect(mockNetWorth.calculateNetWorth).toHaveBeenCalledTimes(1);
    });

    it("bypasses the cache when forceRefresh is true", async () => {
      await service.getScore("user-healthy");
      await service.getScore("user-healthy", "US", true);
      expect(mockNetWorth.calculateNetWorth).toHaveBeenCalledTimes(2);
    });
  });

  describe("an unhealthy portfolio (undiversified, high risk, overspending, no goals, large un-harvested losses, uninsured)", () => {
    beforeEach(() => {
      mockNetWorth.calculateNetWorth.mockResolvedValue(
        makeNetWorth({
          totalAssets: 1_000_000,
          assetAllocation: [{ category: "CRYPTO", valueInBase: 1_000_000, percentage: 100 }],
        }),
      );
      mockAnalytics.getAllocation.mockResolvedValue({ overallDiversificationScore: 10 });
      mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: 90, subScores: [], computedAt: "", cached: false });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 50_000, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(60_000); // negative savings rate
      mockHarvesting.getHarvestCandidates.mockResolvedValue([{ unrealizedLoss: -150_000 }]);
      mockGoals.findAll.mockResolvedValue([]);
    });

    it("produces a low overall score", async () => {
      const result = await service.getScore("user-unhealthy");
      expect(result.overallScore).not.toBeNull();
      expect(result.overallScore as number).toBeLessThan(40);
    });
  });

  it("gracefully excludes goal progress (insufficientData) rather than failing when a user has zero active goals", async () => {
    mockNetWorth.calculateNetWorth.mockResolvedValue(
      makeNetWorth({ totalAssets: 500_000, assetAllocation: [{ category: "STOCK", valueInBase: 500_000, percentage: 100 }] }),
    );
    mockAnalytics.getAllocation.mockResolvedValue({ overallDiversificationScore: 60 });
    mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: 50, subScores: [], computedAt: "", cached: false });
    mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 80_000, currency: "INR", breakdown: [] });
    mockTransactions.getAverageMonthlyExpense.mockResolvedValue(70_000);
    mockHarvesting.getHarvestCandidates.mockResolvedValue([]);
    mockGoals.findAll.mockResolvedValue([]);

    const result = await service.getScore("user-no-goals");
    const goalSub = result.subScores.find((s) => s.key === "goalProgress");
    expect(goalSub).toMatchObject({ insufficientData: true });
    expect(result.overallScore).not.toBeNull(); // still computable from the other 5 dimensions
  });

  it("continues (harvest opportunities treated as none) rather than failing the whole score when the harvest scan rejects", async () => {
    mockNetWorth.calculateNetWorth.mockResolvedValue(
      makeNetWorth({ totalAssets: 500_000, assetAllocation: [{ category: "STOCK", valueInBase: 500_000, percentage: 100 }] }),
    );
    mockAnalytics.getAllocation.mockResolvedValue({ overallDiversificationScore: 60 });
    mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: 50, subScores: [], computedAt: "", cached: false });
    mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 80_000, currency: "INR", breakdown: [] });
    mockTransactions.getAverageMonthlyExpense.mockResolvedValue(70_000);
    mockHarvesting.getHarvestCandidates.mockRejectedValue(new Error("quant service unreachable"));
    mockGoals.findAll.mockResolvedValue([{ percentComplete: 50 }]);

    const result = await service.getScore("user-harvest-down");
    const taxSub = result.subScores.find((s) => s.key === "taxEfficiency");
    expect(taxSub).toMatchObject({ score: 100 }); // zero harvestable loss assumed when the scan is unreachable
  });
});
