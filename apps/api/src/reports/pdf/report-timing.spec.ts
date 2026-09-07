import { buildNetWorthStatementPdf } from "./net-worth-statement.pdf";
import { buildTaxReportPdf } from "./tax-report.pdf";
import { ExcelExportService, type ExportColumn } from "../excel-export.service";
import type { DashboardSummary } from "../../net-worth/net-worth.service";
import type { TaxReport } from "@richer/shared-types";

/**
 * Acceptance criterion: "Report generation completes in under 10 seconds
 * for a realistic portfolio size." A realistic RicherWealth portfolio is
 * nowhere near thousands of holdings — a diversified individual investor's
 * account realistically has tens of positions and a few hundred
 * transactions/disposals a year, so 80 allocation rows / 100 disposal lines
 * / 200 transaction export rows is a deliberately generous stand-in.
 */
describe("Report generation timing (acceptance criterion: < 10s for a realistic portfolio)", () => {
  it("net worth statement with 80 asset-allocation rows generates in well under 10s", async () => {
    const bigAllocation = Array.from({ length: 80 }, (_, i) => ({
      category: `HOLDING_${i}`,
      valueInBase: 1000 + i * 37.5,
      percentage: 100 / 80,
    }));
    const summary: DashboardSummary = {
      totalNetWorth: bigAllocation.reduce((s, a) => s + a.valueInBase, 0),
      todayChangeAbs: 100,
      todayChangePct: 0.5,
      monthChangeAbs: 500,
      monthChangePct: 2.1,
      yearChangeAbs: 3000,
      yearChangePct: 9.4,
      assetAllocation: bigAllocation,
      currencyExposure: [
        { currency: "USD", valueInBase: 60000, percentage: 60 },
        { currency: "INR", valueInBase: 25000, percentage: 25 },
        { currency: "EUR", valueInBase: 15000, percentage: 15 },
      ],
      emergencyFundHealth: 5.5,
      debtRatio: 0.12,
      snapshots: [],
      hasAssets: true,
      baseCurrency: "USD",
    };

    const start = Date.now();
    const pdf = await buildNetWorthStatementPdf(summary, "Realistic Test User", { text: "x", isPlaceholder: true });
    const elapsedMs = Date.now() - start;

    expect(pdf.length).toBeGreaterThan(1000);
    expect(elapsedMs).toBeLessThan(10_000);
    // eslint-disable-next-line no-console
    console.log(`[timing] net-worth-statement PDF, 80 allocation rows: ${elapsedMs}ms`);
  });

  it("tax report with 100 capital-gains disposal lines generates in well under 10s", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({
      ticker: `SYM${i}`,
      holdingType: "STOCK",
      quantity: 10 + i,
      realizedGainLoss: (i % 2 === 0 ? 1 : -1) * (50 + i * 3.3),
      holdingPeriodDays: 30 + i,
      isBackfillEstimate: false,
      disposedAt: new Date(2026, 0, 1 + i).toISOString(),
    }));
    const report: TaxReport = {
      generatedAt: new Date().toISOString(),
      financialYear: "2025-26",
      countryCode: "US",
      countryName: "United States",
      currency: "USD",
      capitalGains: {
        shortTerm: { totalGains: 5000, totalLosses: 1000, net: 4000, lines: lines as never },
        longTerm: { totalGains: 8000, totalLosses: 500, net: 7500, exemptionApplied: 0, taxableGain: 7500, lines: [] },
      },
      dividends: { totalDividendIncome: 1200, estimatedRatePct: 15, estimatedWithholdingTax: 180, records: [] },
      totalEstimatedTax: 2500,
      notes: ["Test note."],
      hasBackfillEstimateData: false,
    };

    const start = Date.now();
    const pdf = await buildTaxReportPdf(report, "Realistic Test User", { text: "x", isPlaceholder: true });
    const elapsedMs = Date.now() - start;

    expect(pdf.length).toBeGreaterThan(1000);
    expect(elapsedMs).toBeLessThan(10_000);
    // eslint-disable-next-line no-console
    console.log(`[timing] tax-report PDF, 100 disposal lines (multi-page): ${elapsedMs}ms`);
  });

  it("Excel export of 200 transaction-like rows generates in well under 10s", async () => {
    const service = new ExcelExportService();
    const columns: ExportColumn[] = [
      { key: "date", header: "Date", type: "date" },
      { key: "type", header: "Type", type: "string" },
      { key: "amount", header: "Amount", type: "currency" },
      { key: "category", header: "Category", type: "string" },
    ];
    const rows = Array.from({ length: 200 }, (_, i) => ({
      date: new Date(2026, 0, 1 + (i % 28)),
      type: i % 2 === 0 ? "expense" : "income",
      amount: 10 + i * 1.5,
      category: `CATEGORY_${i % 10}`,
    }));

    const start = Date.now();
    const buffer = await service.buildWorkbook(columns, rows);
    const elapsedMs = Date.now() - start;

    expect(buffer.length).toBeGreaterThan(1000);
    expect(elapsedMs).toBeLessThan(10_000);
    // eslint-disable-next-line no-console
    console.log(`[timing] Excel export, 200 rows: ${elapsedMs}ms`);
  });
});
