import { Injectable, Logger } from "@nestjs/common";
import { CapitalGainsService } from "./capital-gains.service";
import { DividendTaxService } from "./dividend-tax.service";
import { getTaxConfig, type TaxReport } from "@richer/shared-types";
import { stringify } from "csv-stringify/sync";
import PDFDocument from "pdfkit";

/**
 * Builds the combined `TaxReport` (capital gains + dividends for one FY)
 * and renders it as CSV or PDF. Both formats are generated FROM the same
 * `TaxReport` object this service builds from the same
 * CapitalGainsService/DividendTaxService calls the JSON API endpoint uses
 * — there is no second, independent computation of totals for the
 * downloadable formats, so a report's numbers can never drift from what
 * `/api/tax/capital-gains` and `/api/tax/dividends` show on-screen.
 */
@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    private readonly capitalGains: CapitalGainsService,
    private readonly dividends: DividendTaxService,
  ) {}

  async buildReport(userId: string, financialYear: string, countryCode: string): Promise<TaxReport> {
    const config = getTaxConfig(countryCode);
    const [capitalGainsSummary, dividendSummary] = await Promise.all([
      this.capitalGains.getCapitalGainsSummary(userId, financialYear, countryCode),
      this.dividends.getDividendSummary(userId, financialYear, countryCode),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      financialYear,
      countryCode,
      countryName: config.countryName,
      currency: config.currencyCode,
      capitalGains: capitalGainsSummary,
      dividends: dividendSummary,
      totalEstimatedTax: Math.round((capitalGainsSummary.totalEstimatedTax + dividendSummary.estimatedWithholdingTax) * 100) / 100,
      notes: config.notes,
      hasBackfillEstimateData: capitalGainsSummary.hasBackfillEstimateData,
    };
  }

  buildCsv(report: TaxReport): string {
    const rows: (string | number)[][] = [
      ["RicherWealth Tax Report — NOT TAX ADVICE"],
      ["Financial Year", report.financialYear],
      ["Country", report.countryName],
      ["Currency", report.currency],
      ["Generated At", report.generatedAt],
      [],
      ["— Capital Gains: Short-Term —"],
      ["Ticker", "Holding Type", "Quantity", "Proceeds", "Cost Basis", "Realized Gain/Loss", "Holding Period (days)", "Disposed At", "Backfill Estimate?"],
      ...report.capitalGains.shortTerm.lines.map((l) => [
        l.ticker, l.holdingType, l.quantity, l.proceedsTotal, l.costBasisTotal, l.realizedGainLoss, l.holdingPeriodDays, l.disposedAt, l.isBackfillEstimate ? "YES" : "no",
      ]),
      ["Short-Term Totals", "", "", "", "", report.capitalGains.shortTerm.net, "", "", ""],
      [],
      ["— Capital Gains: Long-Term —"],
      ["Ticker", "Holding Type", "Quantity", "Proceeds", "Cost Basis", "Realized Gain/Loss", "Holding Period (days)", "Disposed At", "Backfill Estimate?"],
      ...report.capitalGains.longTerm.lines.map((l) => [
        l.ticker, l.holdingType, l.quantity, l.proceedsTotal, l.costBasisTotal, l.realizedGainLoss, l.holdingPeriodDays, l.disposedAt, l.isBackfillEstimate ? "YES" : "no",
      ]),
      ["Long-Term Totals (before exemption)", "", "", "", "", report.capitalGains.longTerm.net, "", "", ""],
      ["Exemption Applied", "", "", "", "", -report.capitalGains.longTerm.exemptionApplied, "", "", ""],
      ["Long-Term Taxable Gain", "", "", "", "", report.capitalGains.longTerm.taxableGain, "", "", ""],
      [],
      ["— Dividends —"],
      ["Ticker", "Holding Type", "Amount", "Currency", "Received At"],
      ...report.dividends.records.map((r) => [r.ticker, r.holdingType, r.amount, r.currencyCode, r.receivedAt]),
      ["Total Dividend Income", "", report.dividends.totalDividendIncome, report.dividends.currency, ""],
      [],
      ["Total Estimated Tax (capital gains + dividends)", report.totalEstimatedTax],
      [],
      ["Notes"],
      ...report.notes.map((n) => [n]),
      report.hasBackfillEstimateData
        ? ["NOTE: one or more lots above are backfill estimates (isBackfillEstimate=YES) — a single synthetic lot approximated from a pre-existing holding's average buy price and purchase date, not real per-purchase history."]
        : [],
    ];
    return stringify(rows);
  }

  /** pdfkit streams asynchronously even for an in-memory buffer; wrapped here so callers get a plain Promise<Buffer>. */
  async buildPdf(report: TaxReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text("RicherWealth Tax Report", { align: "left" });
      doc.fontSize(9).fillColor("#888").text("NOT TAX ADVICE — a simplified reference report. Consult a qualified tax professional before filing.");
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#000").text(`Financial Year: ${report.financialYear}    Country: ${report.countryName}    Currency: ${report.currency}`);
      doc.fontSize(9).fillColor("#888").text(`Generated ${report.generatedAt}`);
      doc.moveDown(1);

      const money = (n: number) => `${report.currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      doc.fontSize(13).fillColor("#000").text("Capital Gains — Short-Term");
      doc.fontSize(10);
      doc.text(`Total Gains: ${money(report.capitalGains.shortTerm.totalGains)}    Total Losses: ${money(report.capitalGains.shortTerm.totalLosses)}    Net: ${money(report.capitalGains.shortTerm.net)}`);
      for (const l of report.capitalGains.shortTerm.lines) {
        doc.fontSize(9).text(`  ${l.ticker} (${l.holdingType}) — qty ${l.quantity}, gain/loss ${money(l.realizedGainLoss)}, held ${l.holdingPeriodDays}d${l.isBackfillEstimate ? " [BACKFILL ESTIMATE]" : ""}`);
      }
      doc.moveDown(0.75);

      doc.fontSize(13).fillColor("#000").text("Capital Gains — Long-Term");
      doc.fontSize(10);
      doc.text(`Total Gains: ${money(report.capitalGains.longTerm.totalGains)}    Total Losses: ${money(report.capitalGains.longTerm.totalLosses)}    Net: ${money(report.capitalGains.longTerm.net)}`);
      doc.text(`Exemption Applied: ${money(report.capitalGains.longTerm.exemptionApplied)}    Taxable Gain: ${money(report.capitalGains.longTerm.taxableGain)}`);
      for (const l of report.capitalGains.longTerm.lines) {
        doc.fontSize(9).text(`  ${l.ticker} (${l.holdingType}) — qty ${l.quantity}, gain/loss ${money(l.realizedGainLoss)}, held ${l.holdingPeriodDays}d${l.isBackfillEstimate ? " [BACKFILL ESTIMATE]" : ""}`);
      }
      doc.moveDown(0.75);

      doc.fontSize(13).fillColor("#000").text("Dividend Income");
      doc.fontSize(10).text(`Total: ${money(report.dividends.totalDividendIncome)}    Estimated Tax (${report.dividends.estimatedRatePct}%): ${money(report.dividends.estimatedWithholdingTax)}`);
      for (const r of report.dividends.records) {
        doc.fontSize(9).text(`  ${r.ticker} — ${money(r.amount)} on ${new Date(r.receivedAt).toDateString()}`);
      }
      doc.moveDown(1);

      doc.fontSize(13).fillColor("#000").text(`Total Estimated Tax: ${money(report.totalEstimatedTax)}`);
      if (report.hasBackfillEstimateData) {
        doc.moveDown(0.5).fontSize(9).fillColor("#a55").text(
          "NOTE: one or more lots in this report are BACKFILL ESTIMATES — a single synthetic lot approximated from a pre-existing holding's average buy price and purchase date at the time this phase was added, not real per-purchase transaction history.",
        );
      }
      doc.moveDown(0.5).fontSize(8).fillColor("#888").text(report.notes.join("\n"));

      doc.end();
    });
  }
}
