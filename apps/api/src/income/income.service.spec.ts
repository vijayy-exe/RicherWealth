import { Test, TestingModule } from "@nestjs/testing";
import { IncomeService } from "./income.service";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import Decimal from "decimal.js";

const mockPrisma = {
  income: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  user: { findUniqueOrThrow: jest.fn() },
};

const mockCurrency = {
  convert: jest.fn(async (amount: Decimal, from: string, to: string) => {
    if (from === to) return amount;
    if (from === "USD" && to === "INR") return amount.mul(83.5);
    return amount;
  }),
};

const dec = (v: string) => ({ toString: () => v });

describe("IncomeService", () => {
  let service: IncomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CurrencyService, useValue: mockCurrency },
      ],
    }).compile();
    service = module.get(IncomeService);
    jest.clearAllMocks();
  });

  describe("getMonthlyPassiveIncome", () => {
    it("matches the sum of recurring income entries, converted to base currency and monthlyized by frequency", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ baseCurrency: "INR" });
      mockPrisma.income.findMany.mockResolvedValue([
        // Salary: 100,000 INR/month -> 100,000 INR/month
        { sourceType: "SALARY", amount: dec("100000"), frequency: "MONTHLY", currencyCode: "INR" },
        // Rental: 12,000 INR/quarter -> 4,000 INR/month
        { sourceType: "RENTAL", amount: dec("12000"), frequency: "QUARTERLY", currencyCode: "INR" },
        // Dividends: 100 USD/year -> 8.333 USD/month -> converted at 83.5
        { sourceType: "DIVIDENDS", amount: dec("100"), frequency: "ANNUALLY", currencyCode: "USD" },
      ]);

      const result = await service.getMonthlyPassiveIncome("user1");

      // Hand-computed expected total:
      // SALARY: 100000
      // RENTAL: 12000/3 = 4000
      // DIVIDENDS: (100/12) * 83.5 = 695.8333...
      const expected = 100_000 + 4_000 + (100 / 12) * 83.5;
      expect(result.monthlyAmount).toBeCloseTo(expected, 2);
      expect(result.currency).toBe("INR");
      expect(result.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sourceType: "SALARY" }),
          expect.objectContaining({ sourceType: "RENTAL" }),
          expect.objectContaining({ sourceType: "DIVIDENDS" }),
        ]),
      );
    });

    it("excludes ONE_TIME entries from the monthly rollup", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ baseCurrency: "USD" });
      mockPrisma.income.findMany.mockResolvedValue([
        { sourceType: "FREELANCE", amount: dec("5000"), frequency: "ONE_TIME", currencyCode: "USD" },
        { sourceType: "SALARY", amount: dec("6000"), frequency: "MONTHLY", currencyCode: "USD" },
      ]);

      const result = await service.getMonthlyPassiveIncome("user1");
      expect(result.monthlyAmount).toBe(6000);
    });

    it("returns zero when the user has no active income entries", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ baseCurrency: "USD" });
      mockPrisma.income.findMany.mockResolvedValue([]);

      const result = await service.getMonthlyPassiveIncome("user1");
      expect(result.monthlyAmount).toBe(0);
      expect(result.breakdown).toEqual([]);
    });
  });
});
