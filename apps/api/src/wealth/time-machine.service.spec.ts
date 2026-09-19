/**
 * TimeMachineService — deterministic with mocked Prisma, NetWorthService,
 * CurrencyService, and ScenarioSimulatorService. Verifies: (1) past
 * net-worth totals come straight from the nearest real NetWorthSnapshot,
 * unmodified; (2) the approximate-allocation reconstruction correctly picks
 * each asset's NEAREST PRIOR revaluation and correctly EXCLUDES assets that
 * didn't exist yet (or were already deleted) as of the requested date; (3)
 * "project forward" delegates entirely to ScenarioSimulatorService.projectBaseline.
 */
import Decimal from "decimal.js";
import { TimeMachineService } from "./time-machine.service";

describe("TimeMachineService", () => {
  const mockPrisma = {
    netWorthSnapshot: { findFirst: jest.fn() },
    asset: { findMany: jest.fn() },
    assetRevaluation: { findMany: jest.fn() },
  };
  const mockNetWorth = { getTrendSnapshots: jest.fn() };
  const mockCurrency = { convert: jest.fn((amount: Decimal) => Promise.resolve(amount)) }; // identity by default
  const mockScenarioSimulator = { projectBaseline: jest.fn() };

  let service: TimeMachineService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrency.convert.mockImplementation((amount: Decimal) => Promise.resolve(amount));
    service = new TimeMachineService(mockPrisma as never, mockNetWorth as never, mockCurrency as never, mockScenarioSimulator as never);
  });

  describe("getTimeline", () => {
    it("delegates directly to NetWorthService.getTrendSnapshots", async () => {
      mockNetWorth.getTrendSnapshots.mockResolvedValue([{ date: "2026-01-01", netWorth: 100 }]);
      const result = await service.getTimeline("user-1");
      expect(result).toEqual([{ date: "2026-01-01", netWorth: 100 }]);
      expect(mockNetWorth.getTrendSnapshots).toHaveBeenCalledWith("user-1");
    });
  });

  describe("reconstructPastState", () => {
    it("returns insufficientData when no snapshot exists on or before the requested date", async () => {
      mockPrisma.netWorthSnapshot.findFirst.mockResolvedValue(null);
      const result = await service.reconstructPastState("user-1", new Date("2020-01-01"));
      expect(result).toMatchObject({ insufficientData: true });
    });

    it("reports EXACT totals straight from the nearest snapshot, unmodified", async () => {
      mockPrisma.netWorthSnapshot.findFirst.mockResolvedValue({
        snapshotDate: new Date("2025-06-15"),
        totalAssets: new Decimal(1_000_000),
        totalLiabilities: new Decimal(200_000),
        netWorth: new Decimal(800_000),
        baseCurrency: "INR",
      });
      mockPrisma.asset.findMany.mockResolvedValue([]);

      const result = await service.reconstructPastState("user-1", new Date("2025-06-20"));

      expect(result).toMatchObject({
        snapshotDate: "2025-06-15",
        requestedDate: "2025-06-20",
        totalAssets: 1_000_000,
        totalLiabilities: 200_000,
        netWorth: 800_000,
        baseCurrency: "INR",
        isApproximate: true,
      });
      // The query used the REQUESTED date as the upper bound, not the snapshot's own date.
      expect(mockPrisma.netWorthSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ snapshotDate: { lte: new Date("2025-06-20") } }) }),
      );
    });

    it("uses each asset's nearest PRIOR revaluation, not its current value, when one exists", async () => {
      mockPrisma.netWorthSnapshot.findFirst.mockResolvedValue({
        snapshotDate: new Date("2025-06-01"), totalAssets: new Decimal(0), totalLiabilities: new Decimal(0), netWorth: new Decimal(0), baseCurrency: "INR",
      });
      mockPrisma.asset.findMany.mockResolvedValue([
        { id: "asset-1", type: "STOCK", currentValue: new Decimal(500_000), currencyCode: "INR" }, // current value is NOT what should be used
      ]);
      // Two revaluations for asset-1: an older one and a newer-but-still-prior one -- the newer one should win.
      mockPrisma.assetRevaluation.findMany.mockResolvedValue([
        { assetId: "asset-1", value: new Decimal(300_000), currency: "INR" }, // nearest (query already orders desc by valuedAt)
        { assetId: "asset-1", value: new Decimal(200_000), currency: "INR" }, // older
      ]);

      const result = await service.reconstructPastState("user-1", new Date("2025-06-01"));

      expect(result).toMatchObject({
        approximateAllocation: [{ category: "STOCK", valueInBase: 300_000, percentage: 100 }],
      });
    });

    it("falls back to the asset's CURRENT value when no revaluation exists as of the requested date", async () => {
      mockPrisma.netWorthSnapshot.findFirst.mockResolvedValue({
        snapshotDate: new Date("2025-06-01"), totalAssets: new Decimal(0), totalLiabilities: new Decimal(0), netWorth: new Decimal(0), baseCurrency: "INR",
      });
      mockPrisma.asset.findMany.mockResolvedValue([
        { id: "asset-2", type: "CRYPTO", currentValue: new Decimal(75_000), currencyCode: "INR" },
      ]);
      mockPrisma.assetRevaluation.findMany.mockResolvedValue([]);

      const result = await service.reconstructPastState("user-1", new Date("2025-06-01"));

      expect(result).toMatchObject({
        approximateAllocation: [{ category: "CRYPTO", valueInBase: 75_000, percentage: 100 }],
      });
    });

    it("excludes an asset that was created AFTER the requested date (never queries it in the first place)", async () => {
      mockPrisma.netWorthSnapshot.findFirst.mockResolvedValue({
        snapshotDate: new Date("2025-06-01"), totalAssets: new Decimal(0), totalLiabilities: new Decimal(0), netWorth: new Decimal(0), baseCurrency: "INR",
      });
      mockPrisma.asset.findMany.mockResolvedValue([]); // the createdAt: { lte } filter is Prisma's job -- verify the query shape instead
      await service.reconstructPastState("user-1", new Date("2025-06-01"));

      expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: { lte: new Date("2025-06-01") } }) }),
      );
    });

    it("excludes an asset that was (soft-)deleted before the requested date", async () => {
      mockPrisma.netWorthSnapshot.findFirst.mockResolvedValue({
        snapshotDate: new Date("2025-06-01"), totalAssets: new Decimal(0), totalLiabilities: new Decimal(0), netWorth: new Decimal(0), baseCurrency: "INR",
      });
      const requestedDate = new Date("2025-06-01");
      mockPrisma.asset.findMany.mockResolvedValue([]);
      await service.reconstructPastState("user-1", requestedDate);

      expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: [{ deletedAt: null }, { deletedAt: { gt: requestedDate } }] }) }),
      );
    });

    it("aggregates multiple assets into category percentages that sum to 100", async () => {
      mockPrisma.netWorthSnapshot.findFirst.mockResolvedValue({
        snapshotDate: new Date("2025-06-01"), totalAssets: new Decimal(0), totalLiabilities: new Decimal(0), netWorth: new Decimal(0), baseCurrency: "INR",
      });
      mockPrisma.asset.findMany.mockResolvedValue([
        { id: "a1", type: "STOCK", currentValue: new Decimal(600_000), currencyCode: "INR" },
        { id: "a2", type: "CASH", currentValue: new Decimal(400_000), currencyCode: "INR" },
      ]);
      mockPrisma.assetRevaluation.findMany.mockResolvedValue([]);

      const result = await service.reconstructPastState("user-1", new Date("2025-06-01"));
      if ("insufficientData" in result) throw new Error("unexpected insufficientData");

      const total = result.approximateAllocation.reduce((s, a) => s + a.percentage, 0);
      expect(total).toBeCloseTo(100, 6);
      expect(result.approximateAllocation.find((a) => a.category === "STOCK")?.percentage).toBeCloseTo(60, 6);
      expect(result.approximateAllocation.find((a) => a.category === "CASH")?.percentage).toBeCloseTo(40, 6);
    });
  });

  describe("projectForward", () => {
    it("delegates entirely to ScenarioSimulatorService.projectBaseline", async () => {
      mockScenarioSimulator.projectBaseline.mockResolvedValue({ horizonMonths: 60, initialValue: 1_000_000, projection: {} });
      const result = await service.projectForward("user-1", 5, 10_000);
      expect(mockScenarioSimulator.projectBaseline).toHaveBeenCalledWith("user-1", 5, 10_000);
      expect(result).toEqual({ horizonMonths: 60, initialValue: 1_000_000, projection: {} });
    });
  });
});
