import { Test, TestingModule } from "@nestjs/testing";
import { TransactionsService } from "./transactions.service";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import Decimal from "decimal.js";

const mockPrisma = {
  transaction: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  categoryRule: { findMany: jest.fn(), upsert: jest.fn() },
  user: { findUniqueOrThrow: jest.fn() },
};

const mockCurrency = {
  convert: jest.fn(async (amount: Decimal) => amount), // identity — same currency in these tests
};

const dec = (v: string) => ({ toString: () => v });

describe("TransactionsService", () => {
  let service: TransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CurrencyService, useValue: mockCurrency },
      ],
    }).compile();
    service = module.get(TransactionsService);
    jest.clearAllMocks();
    mockPrisma.categoryRule.findMany.mockResolvedValue([]);
  });

  describe("create", () => {
    it("auto-categorizes an expense with a recognized merchant via the seed rules", async () => {
      mockPrisma.transaction.create.mockImplementation(({ data }: any) => data);

      const result = await service.create("user1", {
        type: "expense",
        amount: 5.75,
        currencyCode: "USD",
        date: "2026-08-01",
        merchant: "STARBUCKS STORE #4521",
      } as any);

      expect(result.category).toBe("FOOD");
      expect(result.needsCategoryReview).toBe(false);
    });

    it("flags an unrecognized merchant as needing review, category OTHER", async () => {
      mockPrisma.transaction.create.mockImplementation(({ data }: any) => data);

      const result = await service.create("user1", {
        type: "expense",
        amount: 15,
        currencyCode: "USD",
        date: "2026-08-01",
        merchant: "ZQX UNKNOWN MERCHANT",
      } as any);

      expect(result.category).toBe("OTHER");
      expect(result.needsCategoryReview).toBe(true);
    });

    it("respects an explicit category and skips auto-categorization, and learns a rule from it", async () => {
      mockPrisma.transaction.create.mockImplementation(({ data }: any) => data);

      const result = await service.create("user1", {
        type: "expense",
        amount: 20,
        currencyCode: "USD",
        date: "2026-08-01",
        merchant: "JOE'S CORNER BODEGA",
        category: "FOOD",
      } as any);

      expect(result.category).toBe("FOOD");
      expect(result.needsCategoryReview).toBe(false);
      expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ userId: "user1", category: "FOOD" }) }),
      );
    });

    it("leaves category null for non-expense transaction types", async () => {
      mockPrisma.transaction.create.mockImplementation(({ data }: any) => data);
      const result = await service.create("user1", { type: "income", amount: 3000, currencyCode: "USD", date: "2026-08-01" } as any);
      expect(result.category).toBeNull();
      expect(result.needsCategoryReview).toBe(false);
    });
  });

  describe("recategorize", () => {
    it("updates the category, clears needsCategoryReview, and teaches a CategoryRule from the merchant", async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ id: "t1", userId: "user1", merchant: "ACME LOCAL FARMERS MARKET" });
      mockPrisma.transaction.update.mockImplementation(({ data }: any) => ({ id: "t1", ...data }));

      const result = await service.recategorize("user1", "t1", "FOOD");

      expect(result).toMatchObject({ category: "FOOD", needsCategoryReview: false });
      expect(mockPrisma.categoryRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_keyword: { userId: "user1", keyword: "acme" } },
          create: { userId: "user1", keyword: "acme", category: "FOOD" },
        }),
      );
    });
  });

  describe("getCashFlow", () => {
    it("buckets income and expense transactions by month and computes net", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ baseCurrency: "USD" });
      mockPrisma.transaction.findMany.mockResolvedValue([
        { type: "income", amount: dec("3000"), currencyCode: "USD", date: new Date("2026-07-15") },
        { type: "expense", amount: dec("1200"), currencyCode: "USD", date: new Date("2026-07-20") },
        { type: "expense", amount: dec("800"), currencyCode: "USD", date: new Date("2026-08-05") },
      ]);

      const result = await service.getCashFlow("user1", 3);

      expect(result).toEqual([
        { month: "2026-07", income: 3000, expense: 1200, net: 1800 },
        { month: "2026-08", income: 0, expense: 800, net: -800 },
      ]);
    });
  });

  describe("getAverageMonthlyExpense", () => {
    it("averages only the months that actually have expense data", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ baseCurrency: "USD" });
      mockPrisma.transaction.findMany.mockResolvedValue([
        { type: "expense", amount: dec("1000"), currencyCode: "USD", date: new Date("2026-07-10") },
        { type: "expense", amount: dec("2000"), currencyCode: "USD", date: new Date("2026-08-10") },
      ]);

      const avg = await service.getAverageMonthlyExpense("user1", 3);
      expect(avg).toBe(1500);
    });

    it("returns null when there's no expense history", async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ baseCurrency: "USD" });
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      expect(await service.getAverageMonthlyExpense("user1")).toBeNull();
    });
  });

  describe("bulkIngest", () => {
    it("skips a transaction whose externalId already exists (Plaid dedup)", async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        { externalId: "txn_1", date: new Date("2026-08-01"), merchant: "STARBUCKS", amount: dec("5.75") },
      ]);

      const result = await service.bulkIngest(
        "user1",
        [{ date: new Date("2026-08-01"), amount: -5.75, merchant: "STARBUCKS", currencyCode: "USD", externalId: "txn_1" }],
        "bank_sync",
      );

      expect(result).toEqual({ created: 0, skippedDuplicates: 1 });
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });

    it("skips a CSV-imported duplicate by date+merchant+amount composite key (no externalId available)", async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        { externalId: null, date: new Date("2026-08-01"), merchant: "STARBUCKS", amount: dec("5.75") },
      ]);

      const result = await service.bulkIngest(
        "user1",
        [{ date: new Date("2026-08-01"), amount: -5.75, merchant: "STARBUCKS", currencyCode: "USD" }],
        "csv_import",
      );

      expect(result).toEqual({ created: 0, skippedDuplicates: 1 });
    });

    it("creates new transactions and auto-categorizes them", async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.create.mockResolvedValue({});

      const result = await service.bulkIngest(
        "user1",
        [
          { date: new Date("2026-08-01"), amount: -5.75, merchant: "STARBUCKS", currencyCode: "USD", externalId: "txn_1" },
          { date: new Date("2026-08-02"), amount: 3500, merchant: "PAYROLL", currencyCode: "USD", externalId: "txn_2" },
        ],
        "bank_sync",
      );

      expect(result).toEqual({ created: 2, skippedDuplicates: 0 });
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "expense", category: "FOOD", amount: "5.75" }) }),
      );
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: "income", category: null, amount: "3500" }) }),
      );
    });
  });
});
