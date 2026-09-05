/**
 * CapitalGainsService tests — deterministic with a mocked Prisma. The pure
 * FIFO/term-classification/gain math itself is exhaustively hand-verified
 * in packages/shared-types/src/calc/capital-gains.spec.ts; this file
 * verifies the ASSEMBLY layer: that disposeLots correctly persists
 * TaxLotDisposal rows and decrements TaxLot.remainingQuantity/status, and
 * that getCapitalGainsSummary correctly aggregates short vs. long lines —
 * including the acceptance-criteria case: a disposal is correctly
 * classified short vs. long term based on holding period, with the right
 * gain/loss amount.
 */
import Decimal from "decimal.js";
import { CapitalGainsService } from "./capital-gains.service";

describe("CapitalGainsService", () => {
  let taxLots: Array<Record<string, unknown>>;
  let disposals: Array<Record<string, unknown>>;
  let disposalIdCounter: number;

  const mockPrisma = {
    taxLot: {
      findMany: jest.fn((args: { where: { ticker?: string; holdingType?: string } }) =>
        Promise.resolve(taxLots.filter((l) => (!args.where.ticker || l["ticker"] === args.where.ticker) && (!args.where.holdingType || l["holdingType"] === args.where.holdingType))),
      ),
      update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        const lot = taxLots.find((l) => l["id"] === args.where.id)!;
        Object.assign(lot, args.data);
        return Promise.resolve(lot);
      }),
    },
    taxLotDisposal: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const disposal = { id: `disposal-${++disposalIdCounter}`, createdAt: new Date(), ...args.data };
        disposals.push(disposal);
        return Promise.resolve(disposal);
      }),
      findMany: jest.fn((args: { where: { disposedAt: { gte: Date; lte: Date }; taxLot?: { holdingType: string } } }) => {
        const matching = disposals.filter((d) => {
          const disposedAt = d["disposedAt"] as Date;
          return disposedAt >= args.where.disposedAt.gte && disposedAt <= args.where.disposedAt.lte;
        });
        return Promise.resolve(
          matching.map((d) => ({ ...d, taxLot: taxLots.find((l) => l["id"] === d["taxLotId"]) })),
        );
      }),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  };

  let service: CapitalGainsService;

  beforeEach(() => {
    jest.clearAllMocks();
    taxLots = [];
    disposals = [];
    disposalIdCounter = 0;
    service = new CapitalGainsService(mockPrisma as never);
  });

  function makeLot(overrides: Record<string, unknown> = {}) {
    const lot = {
      id: "lot-1", userId: "user-1", holdingType: "STOCK", assetId: null,
      ticker: "ACME", displayName: "Acme Corp",
      quantity: new Decimal(100), remainingQuantity: new Decimal(100),
      costBasisPerUnit: new Decimal(50), costBasisCurrency: "USD",
      acquiredAt: new Date("2024-01-01"), isBackfillEstimate: false, status: "OPEN",
      createdAt: new Date(), updatedAt: new Date(),
      ...overrides,
    };
    taxLots.push(lot);
    return lot;
  }

  describe("disposeLots — acceptance criterion: short vs long term classification with correct gain/loss", () => {
    it("classifies a disposal held > 1 year as LONG term with the right gain", async () => {
      makeLot({ acquiredAt: new Date("2024-01-01"), costBasisPerUnit: new Decimal(50) });

      const result = await service.disposeLots(
        "user-1", "STOCK", "ACME",
        { quantity: 10, proceedsPerUnit: 80, proceedsCurrency: "USD", disposedAt: "2026-06-01" },
        "US",
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        term: "LONG",
        quantity: "10.0000000000",
        realizedGainLoss: "300.000000", // (80-50) * 10
      });
      expect(taxLots[0]!["remainingQuantity"]).toEqual(new Decimal(90).toFixed(10));
      expect(taxLots[0]!["status"]).toBe("PARTIALLY_DISPOSED");
    });

    it("classifies a disposal held < 1 year as SHORT term with the right loss", async () => {
      makeLot({ acquiredAt: new Date("2026-01-01"), costBasisPerUnit: new Decimal(100) });

      const result = await service.disposeLots(
        "user-1", "STOCK", "ACME",
        { quantity: 10, proceedsPerUnit: 70, proceedsCurrency: "USD", disposedAt: "2026-06-01" },
        "US",
      );

      expect(result[0]).toMatchObject({
        term: "SHORT",
        realizedGainLoss: "-300.000000", // (70-100) * 10
      });
    });

    it("closes a lot fully consumed by a disposal", async () => {
      makeLot({ quantity: new Decimal(10), remainingQuantity: new Decimal(10) });

      await service.disposeLots(
        "user-1", "STOCK", "ACME",
        { quantity: 10, proceedsPerUnit: 80, proceedsCurrency: "USD", disposedAt: "2026-06-01" },
        "US",
      );

      expect(taxLots[0]!["status"]).toBe("CLOSED");
    });

    it("FIFO-consumes across two lots when one isn't enough", async () => {
      makeLot({ id: "lot-old", acquiredAt: new Date("2024-01-01"), remainingQuantity: new Decimal(5), quantity: new Decimal(5), costBasisPerUnit: new Decimal(40) });
      makeLot({ id: "lot-new", acquiredAt: new Date("2025-06-01"), remainingQuantity: new Decimal(20), quantity: new Decimal(20), costBasisPerUnit: new Decimal(60) });

      const result = await service.disposeLots(
        "user-1", "STOCK", "ACME",
        { quantity: 10, proceedsPerUnit: 100, proceedsCurrency: "USD", disposedAt: "2026-06-01" },
        "US",
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ taxLotId: "lot-old", quantity: "5.0000000000" });
      expect(result[1]).toMatchObject({ taxLotId: "lot-new", quantity: "5.0000000000" });
    });

    it("rejects a cross-currency disposal rather than silently mixing currencies", async () => {
      makeLot({ costBasisCurrency: "USD" });
      await expect(
        service.disposeLots("user-1", "STOCK", "ACME", { quantity: 10, proceedsPerUnit: 80, proceedsCurrency: "INR", disposedAt: "2026-06-01" }, "US"),
      ).rejects.toThrow(/Cross-currency/);
    });
  });

  describe("getCapitalGainsSummary", () => {
    it("aggregates short-term and long-term disposals into separate, correctly-summed buckets", async () => {
      makeLot({ id: "long-lot", acquiredAt: new Date("2024-01-01"), costBasisPerUnit: new Decimal(50) });
      makeLot({ id: "short-lot", ticker: "OTHER", displayName: "Other Corp", acquiredAt: new Date("2026-01-01"), costBasisPerUnit: new Decimal(100) });

      await service.disposeLots("user-1", "STOCK", "ACME", { quantity: 10, proceedsPerUnit: 80, proceedsCurrency: "USD", disposedAt: "2026-06-01" }, "US");
      await service.disposeLots("user-1", "STOCK", "OTHER", { quantity: 5, proceedsPerUnit: 70, proceedsCurrency: "USD", disposedAt: "2026-06-01" }, "US");

      const summary = await service.getCapitalGainsSummary("user-1", "2026", "US");

      expect(summary.longTerm.totalGains).toBe(300); // (80-50)*10
      expect(summary.shortTerm.totalLosses).toBe(-150); // (70-100)*5
      expect(summary.shortTerm.net).toBe(-150);
      expect(summary.longTerm.lines).toHaveLength(1);
      expect(summary.shortTerm.lines).toHaveLength(1);
    });

    it("flags hasBackfillEstimateData when a disposed lot was a synthetic backfill lot", async () => {
      makeLot({ isBackfillEstimate: true, acquiredAt: new Date("2024-01-01") });
      await service.disposeLots("user-1", "STOCK", "ACME", { quantity: 10, proceedsPerUnit: 80, proceedsCurrency: "USD", disposedAt: "2026-06-01" }, "US");

      const summary = await service.getCapitalGainsSummary("user-1", "2026", "US");
      expect(summary.hasBackfillEstimateData).toBe(true);
    });
  });
});
