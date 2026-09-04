/**
 * AnalyticsService unit tests — deterministic with mocked Prisma, quant
 * client, market data, and risk-free-rate services. Focused on Phase 11's
 * actual new logic: date-alignment across holdings with different trading
 * calendars (stocks vs. crypto vs. mutual funds), value-weighted portfolio
 * return aggregation, and graceful "insufficient data" handling — the
 * quant math itself is covered independently by apps/quant/tests/.
 */
import { AnalyticsService, alignByDate, intersectDates, mean, stdDev } from "./analytics.service";
import type { DailyReturn } from "./market-data.service";

describe("pure helper functions", () => {
  describe("intersectDates", () => {
    it("returns the common dates across all series, sorted", () => {
      const a: DailyReturn[] = [{ date: "2026-01-01", return: 0.01 }, { date: "2026-01-02", return: 0.02 }, { date: "2026-01-03", return: 0.03 }];
      const b: DailyReturn[] = [{ date: "2026-01-02", return: 0.05 }, { date: "2026-01-03", return: 0.06 }, { date: "2026-01-04", return: 0.07 }];
      expect(intersectDates([a, b])).toEqual(["2026-01-02", "2026-01-03"]);
    });

    it("returns empty when there is no overlap", () => {
      const a: DailyReturn[] = [{ date: "2026-01-01", return: 0.01 }];
      const b: DailyReturn[] = [{ date: "2026-02-01", return: 0.02 }];
      expect(intersectDates([a, b])).toEqual([]);
    });

    it("handles a single series (intersection with itself)", () => {
      const a: DailyReturn[] = [{ date: "2026-01-01", return: 0.01 }, { date: "2026-01-02", return: 0.02 }];
      expect(intersectDates([a])).toEqual(["2026-01-01", "2026-01-02"]);
    });

    it("returns empty for an empty input list", () => {
      expect(intersectDates([])).toEqual([]);
    });
  });

  describe("alignByDate", () => {
    it("pairs up returns that share a date, dropping unmatched ones", () => {
      const a: DailyReturn[] = [{ date: "2026-01-01", return: 0.10 }, { date: "2026-01-02", return: 0.20 }, { date: "2026-01-05", return: 0.50 }];
      const b: DailyReturn[] = [{ date: "2026-01-01", return: 0.01 }, { date: "2026-01-02", return: 0.02 }, { date: "2026-01-03", return: 0.03 }];
      const result = alignByDate(a, b);
      expect(result.a).toEqual([0.10, 0.20]);
      expect(result.b).toEqual([0.01, 0.02]);
    });

    it("preserves the order of the first series", () => {
      const a: DailyReturn[] = [{ date: "2026-01-03", return: 3 }, { date: "2026-01-01", return: 1 }];
      const b: DailyReturn[] = [{ date: "2026-01-01", return: 10 }, { date: "2026-01-03", return: 30 }];
      const result = alignByDate(a, b);
      expect(result.a).toEqual([3, 1]);
      expect(result.b).toEqual([30, 10]);
    });
  });

  describe("mean / stdDev", () => {
    it("computes sample mean and sample (ddof=1) standard deviation", () => {
      // Same reference values as the quant service's own test_mean_and_std_dev_reference
      const values = [0.01, 0.02, 0.03, 0.04, 0.05];
      expect(mean(values)).toBeCloseTo(0.03, 12);
      expect(stdDev(values)).toBeCloseTo(0.0158113883008419, 12);
    });
  });
});

describe("AnalyticsService orchestration", () => {
  const mockPrisma = {
    asset: { findMany: jest.fn() },
    assetRevaluation: { findMany: jest.fn() },
    navHistory: { findMany: jest.fn() },
  };
  const mockConfig = { get: jest.fn() };
  // Real Map-backed store (not a static jest.fn() return) so the
  // "second call is cached" tests actually exercise get/set round-tripping
  // rather than always seeing a fixed mocked value.
  let memoryStore: Map<string, string>;
  const mockMemoryCache = {
    get: jest.fn((key: string) => memoryStore.get(key) ?? null),
    set: jest.fn((key: string, value: string) => memoryStore.set(key, value)),
  };
  const mockQuant = {
    allocation: jest.fn(),
    riskMetrics: jest.fn(),
    correlation: jest.fn(),
    monteCarlo: jest.fn(),
  };
  const mockRiskFreeRate = { getPeriodRate: jest.fn().mockResolvedValue(0.0001) };
  const mockMarketData = {
    getStockMetadata: jest.fn(),
    getCryptoMetadata: jest.fn(),
    staticMetadata: jest.fn().mockReturnValue({ sector: "UNKNOWN", geography: "UNKNOWN", marketCap: "N/A" }),
    getStockReturns: jest.fn(),
    getCryptoReturns: jest.fn(),
    getMutualFundReturns: jest.fn(),
    getRevaluationReturns: jest.fn(),
  };

  let service: AnalyticsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    memoryStore = new Map();
    // Point at a port nothing listens on so the real-Redis connect attempt
    // fails fast and deterministically falls back to the in-memory adapter
    // — otherwise these tests would read/write actual keys on whatever
    // Redis happens to be running locally, making "first call not cached"
    // assertions flaky across repeated test runs.
    mockConfig.get.mockImplementation((key: string) => (key === "REDIS_URL" ? "redis://127.0.0.1:1" : undefined));
    service = new AnalyticsService(
      mockPrisma as never,
      mockConfig as never,
      mockMemoryCache as never,
      mockQuant as never,
      mockRiskFreeRate as never,
      mockMarketData as never,
    );
    // Direct instantiation (not through Nest's DI container) skips the
    // OnModuleInit lifecycle hook, so `this.cache` would be unset — call it
    // explicitly. Connects to a real local Redis if one happens to be
    // running, otherwise falls back to the in-memory adapter; either way
    // the cache behavior under test (hit/miss/TTL) is the same.
    await service.onModuleInit();
  });

  function asset(overrides: Record<string, unknown>) {
    return {
      id: "a1",
      type: "STOCK",
      name: "Test Asset",
      currentValue: { toString: () => "100" },
      currencyCode: "USD",
      stockHolding: null,
      etfHolding: null,
      cryptoHolding: null,
      mutualFundHolding: null,
      ...overrides,
    };
  }

  describe("getAllocation", () => {
    it("returns a zeroed report for a user with no assets", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);
      const result = await service.getAllocation("user1");
      expect(result).toEqual({ totalValue: 0, overallDiversificationScore: 0, byDimension: {} });
      expect(mockQuant.allocation).not.toHaveBeenCalled();
    });

    it("classifies stock holdings via market data and forwards to the quant service", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        asset({ stockHolding: { ticker: "AAPL", exchange: "NASDAQ" } }),
      ]);
      mockMarketData.getStockMetadata.mockResolvedValue({ sector: "Technology", geography: "USA", marketCap: "LARGE" });
      mockQuant.allocation.mockResolvedValue({ totalValue: 100 });

      await service.getAllocation("user1");

      expect(mockMarketData.getStockMetadata).toHaveBeenCalledWith("AAPL", "NASDAQ");
      expect(mockQuant.allocation).toHaveBeenCalledWith(
        expect.objectContaining({
          holdings: [
            expect.objectContaining({ assetClass: "STOCK", sector: "Technology", geography: "USA", marketCap: "LARGE", value: 100 }),
          ],
        }),
      );
    });
  });

  describe("getRiskMetrics", () => {
    it("reports insufficient data when fewer than 2 holdings have history", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);
      const result = await service.getRiskMetrics("user1");
      expect(result).toEqual({ insufficientData: true, reason: expect.any(String) });
      expect(mockQuant.riskMetrics).not.toHaveBeenCalled();
    });

    it("aligns portfolio and benchmark returns by date before calling the quant service", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        asset({ stockHolding: { ticker: "AAPL", exchange: "NASDAQ" }, currentValue: { toString: () => "1000" } }),
      ]);
      mockMarketData.getStockReturns
        .mockResolvedValueOnce([ // portfolio holding's own returns (called from getReturnsForAsset)
          { date: "2026-01-01", return: 0.01 },
          { date: "2026-01-02", return: 0.02 },
          { date: "2026-01-03", return: 0.03 },
        ])
        .mockResolvedValueOnce([ // benchmark returns
          { date: "2026-01-01", return: 0.005 },
          { date: "2026-01-02", return: 0.015 },
          { date: "2026-01-04", return: 0.025 }, // no match in portfolio -> dropped
        ]);
      mockQuant.riskMetrics.mockResolvedValue({ beta: 1.1 });

      const result = await service.getRiskMetrics("user1");

      expect(mockQuant.riskMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          portfolioReturns: [0.01, 0.02],
          benchmarkReturns: [0.005, 0.015],
          periodsPerYear: 252,
        }),
      );
      expect(result).toEqual({ beta: 1.1 });
    });

    it("reports insufficient data when the benchmark can't be fetched", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        asset({ stockHolding: { ticker: "AAPL", exchange: "NASDAQ" } }),
      ]);
      mockMarketData.getStockReturns
        .mockResolvedValueOnce([{ date: "2026-01-01", return: 0.01 }, { date: "2026-01-02", return: 0.02 }])
        .mockResolvedValueOnce(null); // benchmark fetch fails
      const result = await service.getRiskMetrics("user1");
      expect(result).toEqual({ insufficientData: true, reason: expect.stringContaining("benchmark") });
    });
  });

  describe("getCorrelationMatrix", () => {
    it("requires at least 2 holdings with sufficient history", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([
        asset({ id: "a1", stockHolding: { ticker: "AAPL", exchange: "NASDAQ" } }),
      ]);
      mockMarketData.getStockReturns.mockResolvedValue(
        Array.from({ length: 40 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, return: 0.01 })),
      );
      const result = await service.getCorrelationMatrix("user1");
      expect(result).toEqual({ insufficientData: true, reason: expect.any(String) });
    });

    it("swaps opaque holding ids for display names in the response", async () => {
      const dates = Array.from({ length: 40 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, "0")}`);
      mockPrisma.asset.findMany.mockResolvedValue([
        asset({ id: "a1", name: "Apple", stockHolding: { ticker: "AAPL", exchange: "NASDAQ" } }),
        asset({ id: "a2", name: "Google", stockHolding: { ticker: "GOOG", exchange: "NASDAQ" } }),
      ]);
      mockMarketData.getStockReturns.mockResolvedValue(dates.map((date) => ({ date, return: 0.01 })));
      mockQuant.correlation.mockResolvedValue({ labels: ["a1", "a2"], matrix: [[1, 0.5], [0.5, 1]] });

      const result = (await service.getCorrelationMatrix("user1")) as { labels: string[] };

      expect(result.labels).toEqual(["Apple", "Google"]);
    });
  });

  describe("getMonteCarlo", () => {
    it("reports insufficient data with too few return periods", async () => {
      mockPrisma.asset.findMany.mockResolvedValue([]);
      const result = await service.getMonteCarlo("user1");
      expect(result).toEqual({ insufficientData: true, reason: expect.any(String) });
      expect(mockQuant.monteCarlo).not.toHaveBeenCalled();
    });

    it("serves a cached result on the second call without recomputing", async () => {
      const returns = Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, return: 0.001 * (i % 3 === 0 ? -1 : 1) }));
      mockPrisma.asset.findMany.mockResolvedValue([
        asset({ stockHolding: { ticker: "AAPL", exchange: "NASDAQ" }, currentValue: { toString: () => "1000" } }),
      ]);
      mockMarketData.getStockReturns.mockResolvedValue(returns);
      mockQuant.monteCarlo.mockResolvedValue({ periods: 2520, percentiles: {} });

      const first = (await service.getMonteCarlo("user1")) as { cached: boolean };
      expect(first.cached).toBe(false);
      expect(mockQuant.monteCarlo).toHaveBeenCalledTimes(1);

      const second = (await service.getMonteCarlo("user1")) as { cached: boolean };
      expect(second.cached).toBe(true);
      expect(mockQuant.monteCarlo).toHaveBeenCalledTimes(1); // not called again
    });

    it("bypasses the cache when forceRefresh is true", async () => {
      const returns = Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, return: 0.001 }));
      mockPrisma.asset.findMany.mockResolvedValue([
        asset({ stockHolding: { ticker: "AAPL", exchange: "NASDAQ" }, currentValue: { toString: () => "1000" } }),
      ]);
      mockMarketData.getStockReturns.mockResolvedValue(returns);
      mockQuant.monteCarlo.mockResolvedValue({ periods: 2520, percentiles: {} });

      await service.getMonteCarlo("user1");
      await service.getMonteCarlo("user1", 10, 10_000, true);
      expect(mockQuant.monteCarlo).toHaveBeenCalledTimes(2);
    });
  });
});
