/**
 * GoalsService tests — deterministic with mocked Prisma, CurrencyService,
 * AnalyticsService, and QuantClientService. The actual Monte Carlo math
 * (including the "probability changes sensibly with contribution/horizon"
 * acceptance criterion) is covered exactly and rigorously in
 * apps/quant/tests/test_monte_carlo.py — this file verifies the ASSEMBLY
 * layer: ownership checks, progress computation (standalone + linked
 * assets), the assumed-vs-real return fallback, and that inputs are wired
 * correctly into the quant-service payload.
 */
import Decimal from "decimal.js";
import { GoalsService } from "./goals.service";
import { requiredSipForTarget } from "@richer/shared-types";

describe("GoalsService", () => {
  const mockPrisma = {
    goal: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    asset: { findMany: jest.fn() },
  };
  const mockCurrency = { convert: jest.fn((amount: Decimal) => Promise.resolve(amount)) }; // identity conversion by default
  const mockAnalytics = { getReturnSeriesStats: jest.fn() };
  const mockQuant = { monteCarlo: jest.fn() };

  let service: GoalsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrency.convert.mockImplementation((amount: Decimal) => Promise.resolve(amount));
    service = new GoalsService(mockPrisma as never, mockCurrency as never, mockAnalytics as never, mockQuant as never);
  });

  function baseGoal(overrides: Record<string, unknown> = {}) {
    return {
      id: "goal-1", userId: "user-1", type: "VACATION", name: "Trip to Japan",
      targetAmount: new Decimal(500_000), targetDate: new Date("2099-01-01"),
      currencyCode: "INR", linkedAssetIds: [] as string[], standaloneProgressAmount: new Decimal(0),
      notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      ...overrides,
    };
  }

  describe("ownership checks", () => {
    it("throws NotFoundException for a goal that doesn't exist", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(null);
      await expect(service.findOne("user-1", "missing")).rejects.toThrow("Goal not found");
    });

    it("throws ForbiddenException for a goal owned by someone else", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ userId: "someone-else" }));
      await expect(service.findOne("user-1", "goal-1")).rejects.toThrow("Access denied");
    });

    it("treats a soft-deleted goal as not found", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ deletedAt: new Date() }));
      await expect(service.findOne("user-1", "goal-1")).rejects.toThrow("Goal not found");
    });
  });

  describe("progress computation", () => {
    it("uses only the standalone figure when there are no linked assets", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ standaloneProgressAmount: new Decimal(150_000) }));
      const result = await service.findOne("user-1", "goal-1");
      expect(result.currentProgress).toBe(150_000);
      expect(result.percentComplete).toBe(30); // 150000/500000 * 100
    });

    it("sums standalone + linked-asset values, converted to the goal's currency", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(
        baseGoal({ standaloneProgressAmount: new Decimal(50_000), linkedAssetIds: ["asset-1", "asset-2"] }),
      );
      mockPrisma.asset.findMany.mockResolvedValue([
        { currentValue: new Decimal(100_000), currencyCode: "INR" },
        { currentValue: new Decimal(50_000), currencyCode: "INR" },
      ]);
      const result = await service.findOne("user-1", "goal-1");
      expect(result.currentProgress).toBe(200_000); // 50000 + 100000 + 50000
      expect(mockPrisma.asset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ["asset-1", "asset-2"] } }) }),
      );
    });

    it("converts linked-asset values through CurrencyService when currencies differ", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ linkedAssetIds: ["asset-1"], currencyCode: "INR" }));
      mockPrisma.asset.findMany.mockResolvedValue([{ currentValue: new Decimal(1_000), currencyCode: "USD" }]);
      mockCurrency.convert.mockResolvedValue(new Decimal(83_000)); // pretend 1000 USD -> 83000 INR
      const result = await service.findOne("user-1", "goal-1");
      expect(mockCurrency.convert).toHaveBeenCalledWith(new Decimal(1_000), "USD", "INR");
      expect(result.currentProgress).toBe(83_000);
    });

    it("caps percentComplete at 100 even if progress exceeds the target", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ standaloneProgressAmount: new Decimal(600_000) }));
      const result = await service.findOne("user-1", "goal-1");
      expect(result.percentComplete).toBe(100);
    });
  });

  describe("getSuccessProbability", () => {
    it("short-circuits to 100% probability when the goal is already achieved, without calling the quant service", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ standaloneProgressAmount: new Decimal(600_000) }));
      const result = await service.getSuccessProbability("user-1", "goal-1");
      expect(result).toMatchObject({ probabilityOfTarget: 1, alreadyAchieved: true });
      expect(mockQuant.monteCarlo).not.toHaveBeenCalled();
    });

    it("returns an error result when the target date has already passed", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ targetDate: new Date("2000-01-01") }));
      const result = await service.getSuccessProbability("user-1", "goal-1");
      expect(result).toMatchObject({ error: true });
      expect(mockQuant.monteCarlo).not.toHaveBeenCalled();
    });

    it("uses the linked assets' real return stats when available, and flags isAssumedReturn: false", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ linkedAssetIds: ["asset-1"] }));
      mockPrisma.asset.findMany.mockResolvedValue([{ currentValue: new Decimal(100_000), currencyCode: "INR" }]);
      mockAnalytics.getReturnSeriesStats.mockResolvedValue({ muDaily: 0.0004, sigmaDaily: 0.012, hasSufficientData: true });
      mockQuant.monteCarlo.mockResolvedValue({ probabilityOfTarget: 0.62 });

      const result = await service.getSuccessProbability("user-1", "goal-1");
      expect(result).toMatchObject({ isAssumedReturn: false, probabilityOfTarget: 0.62 });
      if (!("error" in result) && !result.isAssumedReturn) {
        expect(result.assumedAnnualReturnPct).toBeCloseTo(0.0004 * 252 * 100, 6);
        expect(result.assumedAnnualVolatilityPct).toBeCloseTo(0.012 * Math.sqrt(252) * 100, 6);
      }
    });

    it("falls back to the documented assumed return when there's no linked-asset data, and flags isAssumedReturn: true", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ linkedAssetIds: [] }));
      mockQuant.monteCarlo.mockResolvedValue({ probabilityOfTarget: 0.55 });

      const result = await service.getSuccessProbability("user-1", "goal-1");
      expect(result).toMatchObject({ isAssumedReturn: true, assumedAnnualReturnPct: 8, assumedAnnualVolatilityPct: 12 });
    });

    it("computes requiredMonthlyContribution identically to calling requiredSipForTarget directly", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal({ targetAmount: new Decimal(1_000_000), targetDate: new Date("2030-01-01") }));
      mockQuant.monteCarlo.mockResolvedValue({ probabilityOfTarget: 0.5 });
      const result = await service.getSuccessProbability("user-1", "goal-1");

      // months remaining is computed internally from "now" to 2030-01-01 — recompute the same way for the expectation
      const now = new Date();
      const months = (2030 - now.getFullYear()) * 12 + (0 - now.getMonth()) - (1 < now.getDate() ? 1 : 0);
      const expected = requiredSipForTarget(1_000_000, 0, 8, months);
      if (!("error" in result)) expect(result.requiredMonthlyContribution).toBeCloseTo(expected as number, 6);
    });

    it("passes a caller-supplied contribution override through to the quant payload instead of the required amount", async () => {
      mockPrisma.goal.findUnique.mockResolvedValue(baseGoal());
      mockQuant.monteCarlo.mockResolvedValue({ probabilityOfTarget: 0.9 });

      const result = await service.getSuccessProbability("user-1", "goal-1", 50_000);
      expect(mockQuant.monteCarlo).toHaveBeenCalledWith(expect.objectContaining({ contributionPerPeriod: 50_000, targetValue: 500_000 }));
      if (!("error" in result)) expect(result.contributionUsed).toBe(50_000);
    });
  });
});
