/**
 * LiabilitiesService loan-intelligence unit tests — deterministic with a
 * mocked Prisma, NetWorthService and CurrencyService. Focused on Phase 9:
 * amortization schedule, prepayment savings, and credit-card revolving math.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { LiabilitiesService } from "./liabilities.service";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";

const mockPrisma = {
  liability: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUniqueOrThrow: jest.fn() },
};

const mockNetWorth = { writeSnapshot: jest.fn() };
const mockCurrency = { convert: jest.fn() };

const dec = (v: string) => ({ toString: () => v });

const MORTGAGE = {
  id: "loan1",
  userId: "user1",
  type: "MORTGAGE",
  name: "Home Loan",
  principalAmount: dec("200000"),
  remainingBalance: dec("200000"),
  interestRate: dec("6"),
  currencyCode: "USD",
  emiAmount: null,
  dueDate: null,
  startDate: null,
  maturityDate: null,
  paymentFrequency: "MONTHLY",
  tenureMonths: 360,
  minPaymentPercent: null,
  minPaymentFlat: null,
  details: {},
  deletedAt: null,
};

const CREDIT_CARD = {
  id: "cc1",
  userId: "user1",
  type: "CREDIT_CARD",
  name: "Visa",
  principalAmount: dec("5000"),
  remainingBalance: dec("5000"),
  interestRate: dec("18"),
  currencyCode: "USD",
  emiAmount: null,
  dueDate: null,
  startDate: null,
  maturityDate: null,
  paymentFrequency: "MONTHLY",
  tenureMonths: null,
  minPaymentPercent: dec("3"),
  minPaymentFlat: dec("25"),
  details: {},
  deletedAt: null,
};

describe("LiabilitiesService — loan intelligence (Phase 9)", () => {
  let service: LiabilitiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiabilitiesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NetWorthService, useValue: mockNetWorth },
        { provide: CurrencyService, useValue: mockCurrency },
      ],
    }).compile();

    service = module.get<LiabilitiesService>(LiabilitiesService);
    jest.clearAllMocks();
  });

  describe("getAmortizationSchedule", () => {
    it("matches a standard loan calculator's output for the stored liability", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue(MORTGAGE);

      const result = await service.getAmortizationSchedule("user1", "loan1");

      expect(result.scheduledPayment).toBeCloseTo(1199.1, 2);
      expect(result.actualPeriods).toBe(360);
    });

    it("rejects access from a user who doesn't own the liability", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue(MORTGAGE);
      await expect(service.getAmortizationSchedule("someone-else", "loan1")).rejects.toThrow(ForbiddenException);
    });

    it("throws NotFoundException for a liability that doesn't exist", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue(null);
      await expect(service.getAmortizationSchedule("user1", "missing")).rejects.toThrow(NotFoundException);
    });

    it("rejects credit cards — they use revolving-balance math, not an amortization schedule", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue(CREDIT_CARD);
      await expect(service.getAmortizationSchedule("user1", "cc1")).rejects.toThrow(BadRequestException);
    });

    it("rejects a liability with no tenureMonths set", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue({ ...MORTGAGE, tenureMonths: null });
      await expect(service.getAmortizationSchedule("user1", "loan1")).rejects.toThrow(BadRequestException);
    });
  });

  describe("getPrepaymentSavings", () => {
    it("shows interest saved and tenure reduction for a hypothetical extra payment", async () => {
      // Fresh loan (no startDate → full remaining tenure), so this exercises
      // the same math as the shared-package fixture: 10,000 @ 12%/12mo + 200 extra.
      mockPrisma.liability.findUnique.mockResolvedValue({
        ...MORTGAGE,
        remainingBalance: dec("10000"),
        interestRate: dec("12"),
        tenureMonths: 12,
      });

      const result = await service.getPrepaymentSavings("user1", "loan1", 200);

      expect(result.interestSaved).toBeCloseTo(118.74, 2);
      expect(result.periodsReduced).toBe(2);
    });

    it("rejects a non-positive extra payment", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue(MORTGAGE);
      await expect(service.getPrepaymentSavings("user1", "loan1", 0)).rejects.toThrow(BadRequestException);
      await expect(service.getPrepaymentSavings("user1", "loan1", -50)).rejects.toThrow(BadRequestException);
    });
  });

  describe("getCreditCardPayoff", () => {
    it("computes correct minimum-payment math for a revolving balance", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue(CREDIT_CARD);

      const result = await service.getCreditCardPayoff("user1", "cc1");

      expect(result.monthlyInterest).toBeCloseTo(75, 2);
      expect(result.minimumPayment).toBeCloseTo(150, 2);
      expect(result.principalPortion).toBeCloseTo(75, 2);
      expect(result.monthsToPayoff).toBe(166);
    });

    it("rejects non-credit-card liabilities", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue(MORTGAGE);
      await expect(service.getCreditCardPayoff("user1", "loan1")).rejects.toThrow(BadRequestException);
    });

    it("falls back to sensible defaults (2% / $25) when minPaymentPercent/Flat aren't set", async () => {
      mockPrisma.liability.findUnique.mockResolvedValue({ ...CREDIT_CARD, minPaymentPercent: null, minPaymentFlat: null });

      const result = await service.getCreditCardPayoff("user1", "cc1");

      // 2% of 5000 = 100 > flat $25 default, so minimumPayment = 100.
      expect(result.minimumPayment).toBeCloseTo(100, 2);
    });
  });

  describe("calculateStandalone", () => {
    it("computes a schedule directly from raw inputs, with no persisted liability", () => {
      const result = service.calculateStandalone({
        principal: 200_000,
        interestRate: 6,
        tenureMonths: 360,
      });

      expect(result.scheduledPayment).toBeCloseTo(1199.1, 2);
    });
  });

  describe("getUpcomingDues", () => {
    it("flags an overdue liability and computes days-until-due for an upcoming one", async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const inFiveDays = new Date(today);
      inFiveDays.setDate(inFiveDays.getDate() + 5);

      mockPrisma.liability.findMany.mockResolvedValue([
        { id: "a", name: "Overdue Card", type: "CREDIT_CARD", dueDate: yesterday, emiAmount: null, currencyCode: "USD" },
        { id: "b", name: "Upcoming EMI", type: "CAR_LOAN", dueDate: inFiveDays, emiAmount: dec("450"), currencyCode: "USD" },
      ]);

      const dues = await service.getUpcomingDues("user1");

      const overdue = dues.find((d) => d.id === "a");
      const upcoming = dues.find((d) => d.id === "b");

      expect(overdue?.isOverdue).toBe(true);
      expect(overdue?.daysUntilDue).toBeLessThan(0);
      expect(upcoming?.isOverdue).toBe(false);
      expect(upcoming?.daysUntilDue).toBe(5);
      expect(upcoming?.emiAmount).toBeCloseTo(450, 2);
    });
  });
});
