import { buildTaxReportPdf } from "./tax-report.pdf";
import { extractPdfText } from "./pdf-test-utils";
import type { TaxReport } from "@richer/shared-types";

/** Second acceptance-criterion proof point: a different report type, same
 * "PDF text contains the exact figures from the real data object" method. */
describe("buildTaxReportPdf", () => {
  const report: TaxReport = {
    generatedAt: new Date().toISOString(),
    financialYear: "2025-26",
    countryCode: "US",
    countryName: "United States",
    currency: "USD",
    capitalGains: {
      shortTerm: { totalGains: 1200, totalLosses: 300, net: 900, lines: [{ ticker: "TSLA", holdingType: "STOCK", quantity: 10, realizedGainLoss: 900, holdingPeriodDays: 45, isBackfillEstimate: false, disposedAt: new Date().toISOString() } as never] },
      longTerm: { totalGains: 5000, totalLosses: 0, net: 5000, exemptionApplied: 0, taxableGain: 5000, lines: [] },
    },
    dividends: { totalDividendIncome: 450.25, estimatedRatePct: 15, estimatedWithholdingTax: 67.54, records: [{ ticker: "AAPL", amount: 450.25, receivedAt: new Date("2026-03-01").toISOString() } as never] },
    totalEstimatedTax: 892.54,
    notes: ["Test note."],
    hasBackfillEstimateData: false,
  };

  it("PDF text contains the exact totals from the same TaxReport object the on-screen /api/tax/report endpoint returns", async () => {
    const pdf = await buildTaxReportPdf(report, "Jamie Test", { text: "placeholder", isPlaceholder: true });
    const text = await extractPdfText(pdf);

    expect(text).toContain("892.54"); // totalEstimatedTax, exact
    expect(text).toContain("2025-26");
    expect(text).toContain("United States");
    expect(text).toContain("TSLA");
    expect(text).toContain("AAPL");
    expect(text).toContain("450.25"); // dividend amount, exact
    expect(text).toContain("NOT TAX ADVICE");
  });

  it("flags backfill-estimate lines with the asterisk marker, never silently presenting them as real history", async () => {
    const withBackfill: TaxReport = {
      ...report,
      capitalGains: {
        ...report.capitalGains,
        shortTerm: { ...report.capitalGains.shortTerm, lines: [{ ticker: "MSFT", holdingType: "STOCK", quantity: 5, realizedGainLoss: 100, holdingPeriodDays: 20, isBackfillEstimate: true, disposedAt: new Date().toISOString() } as never] },
      },
      hasBackfillEstimateData: true,
    };
    const pdf = await buildTaxReportPdf(withBackfill, null, { text: "x", isPlaceholder: true });
    const text = await extractPdfText(pdf);
    expect(text).toContain("BACKFILL ESTIMATE");
  });
});
