/**
 * NetWorthService unit tests — deterministic with mocked Prisma and CurrencyService.
 *
 * All monetary values in INR for clarity. FX: USD→INR = 83.5 (fallback).
 */

import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NetWorthService } from "./net-worth.service";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import Decimal from "decimal.js";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUniqueOrThrow: jest.fn(), findMany: jest.fn() },
  asset: { findMany: jest.fn() },
  liability: { findMany: jest.fn() },
  household: { findUniqueOrThrow: jest.fn() },
  householdMember: { findMany: jest.fn() },
  netWorthSnapshot: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
};

// CurrencyService: returns fixed rates (USD→INR = 83.5, same currency = 1)
const mockCurrency = {
  convert: jest.fn(async (amount: Decimal, from: string, to: string) => {
    if (from === to) return amount;
    if (from === "USD" && to === "INR") return amount.mul(83.5);
    if (from === "INR" && to === "USD") return amount.div(83.5);
    return amount;
  }),
};

const mockEvents = { emit: jest.fn() };

// ─── Helper data ──────────────────────────────────────────────────────────────

const BASE_USER = { baseCurrency: "INR" };

const ASSETS_INR = [
  { type: "STOCK", currentValue: { toString: () => "1000000" }, currencyCode: "INR" },
  { type: "CRYPTO", currentValue: { toString: () => "500000" }, currencyCode: "INR" },
  { type: "GOLD",   currentValue: { toString: () => "300000" }, currencyCode: "INR" },
];

const ASSETS_MIXED = [
  { type: "STOCK", currentValue: { toString: () => "1000" }, currencyCode: "USD" }, // → 83500 INR
  { type: "CASH",  currentValue: { toString: () => "500000" }, currencyCode: "INR" },
];

const LIABILITIES_INR = [
  { remainingBalance: { toString: () => "600000" }, currencyCode: "INR" },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NetWorthService", () => {
  let service: NetWorthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NetWorthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CurrencyService, useValue: mockCurrency },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<NetWorthService>(NetWorthService);
    jest.clearAllMocks();
    // Default: no household memberships — every pre-Phase-21 test below
    // exercises exactly the same single-user behavior as before.
    mockPrisma.householdMember.findMany.mockResolvedValue([]);
  });

  // ─── calculateNetWorth ────────────────────────────────────────────────────

  describe("calculateNetWorth", () => {
    it("correctly sums same-currency assets and liabilities", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_INR);
      mockPrisma.liability.findMany.mockResolvedValue(LIABILITIES_INR);

      const result = await service.calculateNetWorth("user1");

      // totalAssets = 1_800_000
      expect(result.totalAssets.toNumber()).toBeCloseTo(1_800_000, 0);
      // totalLiabilities = 600_000
      expect(result.totalLiabilities.toNumber()).toBeCloseTo(600_000, 0);
      // netWorth = 1_200_000
      expect(result.netWorth.toNumber()).toBeCloseTo(1_200_000, 0);
    });

    it("converts USD assets to INR base currency", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_MIXED);
      mockPrisma.liability.findMany.mockResolvedValue([]);

      const result = await service.calculateNetWorth("user1");

      // $1000 USD → 83_500 INR + 500_000 INR = 583_500
      expect(result.totalAssets.toNumber()).toBeCloseTo(583_500, 0);
      expect(result.netWorth.toNumber()).toBeCloseTo(583_500, 0);
    });

    it("returns zero net worth when user has no assets", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue([]);
      mockPrisma.liability.findMany.mockResolvedValue([]);

      const result = await service.calculateNetWorth("user1");

      expect(result.totalAssets.toNumber()).toBe(0);
      expect(result.totalLiabilities.toNumber()).toBe(0);
      expect(result.netWorth.toNumber()).toBe(0);
      expect(result.debtRatio).toBe(0);
      expect(result.assetAllocation).toHaveLength(0);
    });

    it("calculates debtRatio correctly", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_INR); // 1_800_000
      mockPrisma.liability.findMany.mockResolvedValue(LIABILITIES_INR); // 600_000

      const result = await service.calculateNetWorth("user1");

      // debtRatio = 600_000 / 1_800_000 = 0.333...
      expect(result.debtRatio).toBeCloseTo(0.333, 2);
    });

    it("builds assetAllocation grouped by type", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_INR);
      mockPrisma.liability.findMany.mockResolvedValue([]);

      const result = await service.calculateNetWorth("user1");

      const types = result.assetAllocation.map((a) => a.category);
      expect(types).toContain("STOCK");
      expect(types).toContain("CRYPTO");
      expect(types).toContain("GOLD");

      // Percentages sum to ~100
      const total = result.assetAllocation.reduce((s, a) => s + a.percentage, 0);
      expect(total).toBeCloseTo(100, 1);
    });
  });

  // ─── getDelta ─────────────────────────────────────────────────────────────

  describe("getDelta", () => {
    it("calculates positive delta when net worth grew", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_INR); // current = 1_800_000
      mockPrisma.liability.findMany.mockResolvedValue(LIABILITIES_INR); // → netWorth = 1_200_000
      mockPrisma.netWorthSnapshot.findMany.mockResolvedValue([
        { netWorth: { toString: () => "1000000" } }, // past = 1_000_000
      ]);

      const delta = await service.getDelta("user1", 30);

      expect(delta.absChange).toBeCloseTo(200_000, 0);
      expect(delta.pctChange).toBeCloseTo(20, 1); // 20% growth
    });

    it("returns zero delta when no past snapshot exists", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_INR);
      mockPrisma.liability.findMany.mockResolvedValue(LIABILITIES_INR);
      mockPrisma.netWorthSnapshot.findMany.mockResolvedValue([]);

      const delta = await service.getDelta("user1", 30);

      expect(delta.absChange).toBe(0);
      expect(delta.pctChange).toBe(0);
    });
  });

  // ─── writeSnapshot ────────────────────────────────────────────────────────

  describe("writeSnapshot", () => {
    it("upserts a snapshot and emits the net-worth.updated event", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_INR);
      mockPrisma.liability.findMany.mockResolvedValue(LIABILITIES_INR);
      mockPrisma.netWorthSnapshot.upsert.mockResolvedValue({
        netWorth: "1200000",
        totalAssets: "1800000",
        totalLiabilities: "600000",
        baseCurrency: "INR",
        snapshotDate: new Date(),
      });

      await service.writeSnapshot("user1");

      expect(mockPrisma.netWorthSnapshot.upsert).toHaveBeenCalled();
      expect(mockEvents.emit).toHaveBeenCalledWith(
        "net-worth.updated",
        expect.objectContaining({ userId: "user1" }),
      );
    });
  });

  // ─── Phase 21: household-aware net worth (acceptance criterion 1) ─────────

  describe("household net worth (Family Office mode)", () => {
    const JOINT_HOUSE = { type: "REAL_ESTATE", currentValue: { toString: () => "500000" }, currencyCode: "INR" };
    const PERSONAL_STOCK = { type: "STOCK", currentValue: { toString: () => "100000" }, currencyCode: "INR" };

    it("shows a joint asset at FULL value in a member's own dashboard", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.householdMember.findMany.mockResolvedValue([{ householdId: "hh1" }]);
      // The Prisma mock ignores the `where` shape and just returns what we
      // tell it to — the real dedup guarantee is proven by the household
      // aggregate test below, which queries once for the whole household.
      mockPrisma.asset.findMany.mockResolvedValue([JOINT_HOUSE, PERSONAL_STOCK]);
      mockPrisma.liability.findMany.mockResolvedValue([]);

      const result = await service.calculateNetWorth("spouseA");

      expect(result.totalAssets.toNumber()).toBeCloseTo(600_000, 0); // full 500k house + 100k stock, not halved
    });

    it("household aggregate counts a joint asset exactly once, not once per member", async () => {
      mockPrisma.household.findUniqueOrThrow.mockResolvedValue({ baseCurrency: "INR" });
      mockPrisma.householdMember.findMany.mockResolvedValue([{ userId: "spouseA" }, { userId: "spouseB" }]);
      // A correct implementation queries the household's assets ONCE — the
      // joint house appears a single time in this result set, regardless
      // of how many members belong to the household.
      mockPrisma.asset.findMany.mockResolvedValue([JOINT_HOUSE]);
      mockPrisma.liability.findMany.mockResolvedValue([]);

      const result = await service.calculateHouseholdNetWorth("hh1");

      expect(result.totalAssets.toNumber()).toBeCloseTo(500_000, 0); // NOT 1,000,000
      expect(mockPrisma.asset.findMany).toHaveBeenCalledTimes(1);
    });

    it("a user with no household memberships behaves exactly as before (regression guard)", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue(BASE_USER);
      mockPrisma.householdMember.findMany.mockResolvedValue([]);
      mockPrisma.asset.findMany.mockResolvedValue(ASSETS_INR);
      mockPrisma.liability.findMany.mockResolvedValue(LIABILITIES_INR);

      const result = await service.calculateNetWorth("user1");

      expect(result.totalAssets.toNumber()).toBeCloseTo(1_800_000, 0);
      expect(result.netWorth.toNumber()).toBeCloseTo(1_200_000, 0);
    });
  });
});
