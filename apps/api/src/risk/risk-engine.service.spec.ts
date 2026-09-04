/**
 * RiskEngineService orchestration tests — deterministic with mocked
 * NetWorthService, LiabilitiesService, AnalyticsService, RiskFreeRateService,
 * MacroDataService, and Prisma. The scoring math itself is covered
 * independently and exactly in risk-scoring.spec.ts; this file verifies the
 * ASSEMBLY layer wires real-shaped upstream data into that math correctly,
 * and — per the feature's acceptance criteria — that a low-risk portfolio
 * and a high-risk portfolio produce visibly different overall scores.
 */
import Decimal from "decimal.js";
import { RiskEngineService } from "./risk-engine.service";
import type { NetWorthResult } from "../net-worth/net-worth.service";

describe("RiskEngineService", () => {
  const mockPrisma = {
    asset: { findMany: jest.fn() },
    riskScoreSnapshot: { upsert: jest.fn(), findMany: jest.fn() },
  };
  const mockConfig = { get: jest.fn() };
  let memoryStore: Map<string, string>;
  const mockMemoryCache = {
    get: jest.fn((key: string) => memoryStore.get(key) ?? null),
    set: jest.fn((key: string, value: string) => memoryStore.set(key, value)),
  };
  const mockNetWorth = { calculateNetWorth: jest.fn() };
  const mockLiabilities = { getPortfolioSummary: jest.fn() };
  const mockAnalytics = { getRiskMetrics: jest.fn() };
  const mockRiskFreeRate = { getAnnualRate: jest.fn() };
  const mockMacroData = { getInflationRate: jest.fn() };

  let service: RiskEngineService;

  function makeNetWorth(overrides: Partial<NetWorthResult> & { assetAllocation: NetWorthResult["assetAllocation"]; currencyExposure: NetWorthResult["currencyExposure"]; debtRatio: number }): NetWorthResult {
    return {
      totalAssets: new Decimal(overrides.totalAssets ?? 1_000_000),
      totalLiabilities: new Decimal(0),
      netWorth: new Decimal(1_000_000),
      baseCurrency: "INR",
      ...overrides,
    } as NetWorthResult;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryStore = new Map();
    // Unroutable address (refuses instantly) rather than undefined — a real
    // Redis on the default port would otherwise make these tests slow/flaky.
    mockConfig.get.mockImplementation((key: string) => (key === "REDIS_URL" ? "redis://127.0.0.1:1" : undefined));
    mockPrisma.riskScoreSnapshot.upsert.mockResolvedValue({});

    service = new RiskEngineService(
      mockPrisma as never,
      mockConfig as never,
      mockMemoryCache as never,
      mockNetWorth as never,
      mockLiabilities as never,
      mockAnalytics as never,
      mockRiskFreeRate as never,
      mockMacroData as never,
    );
    await service.onModuleInit();
  });

  describe("a low-risk portfolio (mostly cash/govt bonds, no debt)", () => {
    beforeEach(() => {
      mockNetWorth.calculateNetWorth.mockResolvedValue(
        makeNetWorth({
          debtRatio: 0,
          assetAllocation: [
            { category: "CASH", valueInBase: 300_000, percentage: 30 },
            { category: "BOND", valueInBase: 700_000, percentage: 70 },
          ],
          currencyExposure: [{ currency: "INR", nativeValue: 1_000_000, valueInBase: 1_000_000, percentage: 100 }],
        }),
      );
      mockLiabilities.getPortfolioSummary.mockResolvedValue(null); // no liabilities at all
      mockAnalytics.getRiskMetrics.mockResolvedValue({ beta: 0.2, volatility: 0.03, maxDrawdown: -0.02 });
      mockRiskFreeRate.getAnnualRate.mockResolvedValue({ annualRatePct: 4.5, isLive: true, fetchedAt: "" });
      mockMacroData.getInflationRate.mockResolvedValue({ yoyPct: 2.0, isLive: true, fetchedAt: "" });
      mockPrisma.asset.findMany.mockResolvedValue([
        { currentValue: new Decimal(700_000), bondHolding: { bondType: "GOVT" } },
      ]);
    });

    it("produces a low overall score", async () => {
      const profile = await service.getRiskProfile("user-low");
      expect(profile.overallScore).not.toBeNull();
      expect(profile.overallScore as number).toBeLessThan(40);
      expect(profile.cached).toBe(false);
    });

    it("scores liquidity and credit risk as low, given ample cash and only govt bonds", async () => {
      const profile = await service.getRiskProfile("user-low");
      const liquidity = profile.subScores.find((s) => s.key === "liquidity");
      const credit = profile.subScores.find((s) => s.key === "credit");
      expect(liquidity && "score" in liquidity ? liquidity.score : undefined).toBe(0); // 30% cash > 15% target
      // 70% of assets in 100%-GOVT bonds -> creditExposedPercent = 70*0.05 = 3.5 -> score = 3.5/25*100 = 14 ("low", <25).
      expect(credit && "score" in credit ? credit.score : undefined).toBeCloseTo(14, 6);
      expect(credit && "level" in credit ? credit.level : undefined).toBe("low");
    });

    it("writes a risk-score snapshot for today", async () => {
      await service.getRiskProfile("user-low");
      expect(mockPrisma.riskScoreSnapshot.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.riskScoreSnapshot.upsert.mock.calls[0][0];
      expect(call.where.userId_snapshotDate.userId).toBe("user-low");
      expect(call.create.overallScore).toBeCloseTo(call.update.overallScore, 6);
    });
  });

  describe("a high-risk portfolio (concentrated single foreign stock, high debt)", () => {
    beforeEach(() => {
      mockNetWorth.calculateNetWorth.mockResolvedValue(
        makeNetWorth({
          debtRatio: 0.8,
          assetAllocation: [{ category: "STOCK", valueInBase: 1_000_000, percentage: 100 }],
          currencyExposure: [{ currency: "USD", nativeValue: 12_000, valueInBase: 1_000_000, percentage: 100 }],
        }),
      );
      mockLiabilities.getPortfolioSummary.mockImplementation((_userId: string, type?: string) => {
        if (type === "CREDIT_CARD") return Promise.resolve({ totalOutstanding: 720_000, totalMonthlyEmi: 0, weightedInterestRate: 36, currency: "INR", count: 1 });
        if (type === "PERSONAL_LOAN") return Promise.resolve(null);
        return Promise.resolve({ totalOutstanding: 800_000, totalMonthlyEmi: 0, weightedInterestRate: 30, currency: "INR", count: 2 });
      });
      mockAnalytics.getRiskMetrics.mockResolvedValue({ beta: 2.5, volatility: 0.55, maxDrawdown: -0.60 });
      mockRiskFreeRate.getAnnualRate.mockResolvedValue({ annualRatePct: 6.0, isLive: true, fetchedAt: "" });
      mockMacroData.getInflationRate.mockResolvedValue({ yoyPct: 5.0, isLive: true, fetchedAt: "" });
      mockPrisma.asset.findMany.mockResolvedValue([]); // no bonds at all
    });

    it("produces a high overall score", async () => {
      const profile = await service.getRiskProfile("user-high");
      expect(profile.overallScore).not.toBeNull();
      expect(profile.overallScore as number).toBeGreaterThan(60);
    });

    it("scores liquidity, currency, and market risk as high", async () => {
      const profile = await service.getRiskProfile("user-high");
      const byKey = Object.fromEntries(profile.subScores.map((s) => [s.key, s]));
      expect((byKey["liquidity"] as { score: number }).score).toBe(100); // 0% cash
      expect((byKey["currency"] as { score: number }).score).toBe(100); // 100% foreign currency
      expect((byKey["market"] as { score: number }).score).toBe(100); // extreme vol/beta/drawdown, all capped
    });
  });

  it("scores the high-risk portfolio strictly higher than the low-risk portfolio", async () => {
    mockNetWorth.calculateNetWorth.mockResolvedValueOnce(
      makeNetWorth({
        debtRatio: 0,
        assetAllocation: [
          { category: "CASH", valueInBase: 300_000, percentage: 30 },
          { category: "BOND", valueInBase: 700_000, percentage: 70 },
        ],
        currencyExposure: [{ currency: "INR", nativeValue: 1_000_000, valueInBase: 1_000_000, percentage: 100 }],
      }),
    );
    mockLiabilities.getPortfolioSummary.mockResolvedValueOnce(null);
    mockAnalytics.getRiskMetrics.mockResolvedValueOnce({ beta: 0.2, volatility: 0.03, maxDrawdown: -0.02 });
    mockRiskFreeRate.getAnnualRate.mockResolvedValueOnce({ annualRatePct: 4.5, isLive: true, fetchedAt: "" });
    mockMacroData.getInflationRate.mockResolvedValueOnce({ yoyPct: 2.0, isLive: true, fetchedAt: "" });
    mockPrisma.asset.findMany.mockResolvedValueOnce([{ currentValue: new Decimal(700_000), bondHolding: { bondType: "GOVT" } }]);
    const low = await service.getRiskProfile("user-low-2");

    mockNetWorth.calculateNetWorth.mockResolvedValueOnce(
      makeNetWorth({
        debtRatio: 0.8,
        assetAllocation: [{ category: "STOCK", valueInBase: 1_000_000, percentage: 100 }],
        currencyExposure: [{ currency: "USD", nativeValue: 12_000, valueInBase: 1_000_000, percentage: 100 }],
      }),
    );
    mockLiabilities.getPortfolioSummary.mockImplementation((_userId: string, type?: string) => {
      if (type === "CREDIT_CARD") return Promise.resolve({ totalOutstanding: 720_000, totalMonthlyEmi: 0, weightedInterestRate: 36, currency: "INR", count: 1 });
      if (type === "PERSONAL_LOAN") return Promise.resolve(null);
      return Promise.resolve({ totalOutstanding: 800_000, totalMonthlyEmi: 0, weightedInterestRate: 30, currency: "INR", count: 2 });
    });
    mockAnalytics.getRiskMetrics.mockResolvedValueOnce({ beta: 2.5, volatility: 0.55, maxDrawdown: -0.60 });
    mockRiskFreeRate.getAnnualRate.mockResolvedValueOnce({ annualRatePct: 6.0, isLive: true, fetchedAt: "" });
    mockMacroData.getInflationRate.mockResolvedValueOnce({ yoyPct: 5.0, isLive: true, fetchedAt: "" });
    mockPrisma.asset.findMany.mockResolvedValueOnce([]);
    const high = await service.getRiskProfile("user-high-2");

    expect((high.overallScore as number)).toBeGreaterThan(low.overallScore as number);
  });

  describe("caching", () => {
    beforeEach(() => {
      mockNetWorth.calculateNetWorth.mockResolvedValue(
        makeNetWorth({
          debtRatio: 0,
          assetAllocation: [{ category: "CASH", valueInBase: 1_000_000, percentage: 100 }],
          currencyExposure: [{ currency: "INR", nativeValue: 1_000_000, valueInBase: 1_000_000, percentage: 100 }],
        }),
      );
      mockLiabilities.getPortfolioSummary.mockResolvedValue(null);
      mockAnalytics.getRiskMetrics.mockResolvedValue({ beta: 0, volatility: 0, maxDrawdown: 0 });
      mockRiskFreeRate.getAnnualRate.mockResolvedValue({ annualRatePct: 4.5, isLive: true, fetchedAt: "" });
      mockMacroData.getInflationRate.mockResolvedValue({ yoyPct: 2.0, isLive: true, fetchedAt: "" });
      mockPrisma.asset.findMany.mockResolvedValue([]);
    });

    it("serves the second call from cache without recomputing", async () => {
      const first = await service.getRiskProfile("user-cache");
      expect(first.cached).toBe(false);
      expect(mockNetWorth.calculateNetWorth).toHaveBeenCalledTimes(2); // once for sub-scores, once for credit-exposure assembly

      const second = await service.getRiskProfile("user-cache");
      expect(second.cached).toBe(true);
      expect(mockNetWorth.calculateNetWorth).toHaveBeenCalledTimes(2); // unchanged — no recomputation
      expect(second.overallScore).toBe(first.overallScore);
    });

    it("bypasses the cache when forceRefresh is true", async () => {
      await service.getRiskProfile("user-cache");
      const afterFirst = mockNetWorth.calculateNetWorth.mock.calls.length;
      const refreshed = await service.getRiskProfile("user-cache", true);
      expect(refreshed.cached).toBe(false);
      expect(mockNetWorth.calculateNetWorth.mock.calls.length).toBeGreaterThan(afterFirst);
    });
  });

  it("returns an empty risk trend when there are no snapshots", async () => {
    mockPrisma.riskScoreSnapshot.findMany.mockResolvedValue([]);
    const trend = await service.getRiskTrend("user-none");
    expect(trend).toEqual([]);
  });

  it("maps snapshot rows to trend points", async () => {
    mockPrisma.riskScoreSnapshot.findMany.mockResolvedValue([
      { snapshotDate: new Date("2026-01-01T00:00:00Z"), overallScore: 42.5 },
      { snapshotDate: new Date("2026-02-01T00:00:00Z"), overallScore: 38.1 },
    ]);
    const trend = await service.getRiskTrend("user-trend");
    expect(trend).toEqual([
      { date: "2026-01-01", overallScore: 42.5 },
      { date: "2026-02-01", overallScore: 38.1 },
    ]);
  });
});
