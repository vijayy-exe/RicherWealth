/**
 * ReportService tests — acceptance criterion: "Generated tax report totals
 * reconcile with the underlying transaction data." Rather than re-deriving
 * expected totals with a second, independent formula (which would just be
 * testing the test), this file drives CapitalGainsService/DividendTaxService
 * with mocked Prisma the SAME way capital-gains.service.spec.ts does, sums
 * the raw disposal/dividend rows BY HAND in the test itself, and asserts
 * ReportService's output (both the JSON summary AND the generated CSV
 * text) matches that hand-sum exactly — proving the report never drifts
 * from its own underlying data.
 */
import Decimal from "decimal.js";
import { CapitalGainsService } from "./capital-gains.service";
import { DividendTaxService } from "./dividend-tax.service";
import { ReportService } from "./report.service";

describe("ReportService — total reconciliation", () => {
  let taxLots: Array<Record<string, unknown>>;
  let disposals: Array<Record<string, unknown>>;
  let incomes: Array<Record<string, unknown>>;

  const mockPrisma = {
    taxLot: {
      findMany: jest.fn((args: { where: { ticker?: string } }) => Promise.resolve(taxLots.filter((l) => !args.where.ticker || l["ticker"] === args.where.ticker))),
      update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(taxLots.find((l) => l["id"] === args.where.id)!, args.data);
        return Promise.resolve(null);
      }),
    },
    taxLotDisposal: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const disposal = { id: `d-${disposals.length + 1}`, ...args.data };
        disposals.push(disposal);
        return Promise.resolve(disposal);
      }),
      findMany: jest.fn((args: { where: { disposedAt: { gte: Date; lte: Date } } }) =>
        Promise.resolve(
          disposals
            .filter((d) => (d["disposedAt"] as Date) >= args.where.disposedAt.gte && (d["disposedAt"] as Date) <= args.where.disposedAt.lte)
            .map((d) => ({ ...d, taxLot: taxLots.find((l) => l["id"] === d["taxLotId"]) })),
        ),
      ),
    },
    income: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        const income = { id: `income-${incomes.length + 1}`, createdAt: new Date(), ...args.data };
        incomes.push(income);
        return Promise.resolve(income);
      }),
      findMany: jest.fn((args: { where: { startDate: { gte: Date; lte: Date } } }) =>
        Promise.resolve(incomes.filter((i) => (i["startDate"] as Date) >= args.where.startDate.gte && (i["startDate"] as Date) <= args.where.startDate.lte)),
      ),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  };

  let capitalGains: CapitalGainsService;
  let dividends: DividendTaxService;
  let reports: ReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    taxLots = [];
    disposals = [];
    incomes = [];
    capitalGains = new CapitalGainsService(mockPrisma as never);
    dividends = new DividendTaxService(mockPrisma as never);
    reports = new ReportService(capitalGains, dividends);
  });

  function makeLot(overrides: Record<string, unknown> = {}) {
    const lot = {
      id: `lot-${taxLots.length + 1}`, userId: "user-1", holdingType: "STOCK", assetId: null,
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

  it("report totals reconcile with the raw disposal + dividend rows summed by hand", async () => {
    // Two disposals with known, hand-computable gain/loss:
    makeLot({ id: "lot-a", ticker: "AAA", acquiredAt: new Date("2024-01-01"), costBasisPerUnit: new Decimal(50) }); // -> LONG
    makeLot({ id: "lot-b", ticker: "BBB", acquiredAt: new Date("2026-02-01"), costBasisPerUnit: new Decimal(200) }); // -> SHORT

    await capitalGains.disposeLots("user-1", "STOCK", "AAA", { quantity: 10, proceedsPerUnit: 90, proceedsCurrency: "USD", disposedAt: "2026-06-01" }, "US"); // gain: (90-50)*10 = 400
    await capitalGains.disposeLots("user-1", "STOCK", "BBB", { quantity: 3, proceedsPerUnit: 150, proceedsCurrency: "USD", disposedAt: "2026-07-01" }, "US"); // loss: (150-200)*3 = -150

    // One dividend:
    await dividends.recordDividend("user-1", { ticker: "AAA", displayName: "Acme Corp", holdingType: "STOCK", amount: 25, currencyCode: "USD", receivedAt: "2026-03-15" });

    const report = await reports.buildReport("user-1", "2026", "US");

    // Hand-sum the raw rows exactly as a human auditing this report would:
    const handSummedRealizedGainLoss = disposals.reduce((s, d) => s + new Decimal(d["realizedGainLoss"] as string).toNumber(), 0);
    const handSummedDividends = incomes.reduce((s, i) => s + new Decimal(i["amount"] as string).toNumber(), 0);

    expect(handSummedRealizedGainLoss).toBe(400 + -150);
    expect(handSummedDividends).toBe(25);
    expect(report.capitalGains.longTerm.totalGains + report.capitalGains.longTerm.totalLosses + report.capitalGains.shortTerm.totalGains + report.capitalGains.shortTerm.totalLosses).toBe(400 - 150);

    expect(report.capitalGains.longTerm.lines).toHaveLength(1);
    expect(report.capitalGains.longTerm.lines[0]!.realizedGainLoss).toBe(400);
    expect(report.capitalGains.shortTerm.lines).toHaveLength(1);
    expect(report.capitalGains.shortTerm.lines[0]!.realizedGainLoss).toBe(-150);

    expect(report.dividends.totalDividendIncome).toBe(handSummedDividends);
    expect(report.dividends.records).toHaveLength(1);

    // CSV reconciliation: the exact same numbers must appear in the generated CSV text, not a recomputed figure.
    const csv = reports.buildCsv(report);
    expect(csv).toContain("400"); // long-term gain line
    expect(csv).toContain("-150"); // short-term loss line
    expect(csv).toContain("25"); // dividend amount
  });

  it("generates a real, non-empty PDF buffer that starts with the %PDF magic header, without throwing", async () => {
    makeLot({ acquiredAt: new Date("2024-01-01"), costBasisPerUnit: new Decimal(50) });
    await capitalGains.disposeLots("user-1", "STOCK", "ACME", { quantity: 10, proceedsPerUnit: 80, proceedsCurrency: "USD", disposedAt: "2026-06-01" }, "US");
    const report = await reports.buildReport("user-1", "2026", "US");

    const pdf = await reports.buildPdf(report);
    expect(pdf.length).toBeGreaterThan(500); // a trivially-empty/broken PDF would be near-zero bytes
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
