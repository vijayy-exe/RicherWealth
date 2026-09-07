import type { TaxReport } from "@richer/shared-types";
import { newDocument, drawLetterhead, drawSectionTitle, drawKeyValueRow, drawTable, drawExecutiveSummary } from "./pdf-template.util";

/**
 * Reads the exact same `TaxReport` object Phase 15's `ReportService.buildReport`
 * produces (and that `/api/tax/report` returns on-screen) — this file only
 * renders it, it never recomputes a total. This is a second, better-designed
 * PDF for the same data; Phase 15's original `ReportService.buildPdf` is left
 * untouched and still reachable from the Tax Center page.
 */
export async function buildTaxReportPdf(
  report: TaxReport,
  userName: string | null,
  executiveSummary: { text: string; isPlaceholder: boolean },
): Promise<Buffer> {
  const { doc, finish } = newDocument();
  const money = (n: number) => `${report.currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  drawLetterhead(doc, {
    reportTitle: `Tax Report — FY ${report.financialYear}`,
    userName,
    subtitle: `${report.countryName} • NOT TAX ADVICE — consult a qualified professional before filing`,
  });

  drawExecutiveSummary(doc, executiveSummary.text, executiveSummary.isPlaceholder);

  drawSectionTitle(doc, "Summary");
  drawKeyValueRow(doc, [
    { label: "Total Estimated Tax", value: money(report.totalEstimatedTax), accent: true },
    { label: "Short-Term Net", value: money(report.capitalGains.shortTerm.net) },
    { label: "Long-Term Net", value: money(report.capitalGains.longTerm.net) },
    { label: "Dividend Income", value: money(report.dividends.totalDividendIncome) },
  ]);

  for (const [label, block] of [
    ["Capital Gains — Short-Term", report.capitalGains.shortTerm],
    ["Capital Gains — Long-Term", report.capitalGains.longTerm],
  ] as const) {
    drawSectionTitle(doc, label);
    if (block.lines.length === 0) {
      doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text("No disposals in this period.");
      doc.moveDown(0.6);
    } else {
      drawTable(
        doc,
        [
          { header: "Ticker", width: 0.22 },
          { header: "Type", width: 0.18 },
          { header: "Qty", width: 0.15, align: "right" },
          { header: "Held (days)", width: 0.15, align: "right" },
          { header: "Gain / Loss", width: 0.3, align: "right" },
        ],
        block.lines.map((l) => [
          l.ticker,
          l.holdingType + (l.isBackfillEstimate ? " *" : ""),
          String(l.quantity),
          String(l.holdingPeriodDays),
          money(l.realizedGainLoss),
        ]),
      );
    }
  }

  drawSectionTitle(doc, "Dividend Income");
  if (report.dividends.records.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text("No dividend income recorded in this period.");
  } else {
    drawTable(
      doc,
      [
        { header: "Ticker", width: 0.3 },
        { header: "Date", width: 0.3 },
        { header: "Amount", width: 0.4, align: "right" },
      ],
      report.dividends.records.map((r) => [r.ticker, new Date(r.receivedAt).toDateString(), money(r.amount)]),
    );
  }

  if (report.hasBackfillEstimateData) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#A55").text(
      "* BACKFILL ESTIMATE — a single synthetic lot approximated from a pre-existing holding's average buy price and purchase date, not real per-purchase transaction history.",
    );
    doc.moveDown(0.4);
  }
  doc.font("Helvetica").fontSize(7.5).fillColor("#6B7280").text(report.notes.join("\n"));

  return finish();
}
