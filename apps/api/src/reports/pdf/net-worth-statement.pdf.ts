import type { DashboardSummary } from "../../net-worth/net-worth.service";
import { newDocument, drawLetterhead, drawSectionTitle, drawKeyValueRow, drawTable, drawExecutiveSummary } from "./pdf-template.util";

export async function buildNetWorthStatementPdf(
  summary: DashboardSummary,
  userName: string | null,
  executiveSummary: { text: string; isPlaceholder: boolean },
): Promise<Buffer> {
  const { doc, finish } = newDocument();
  const money = (n: number) => `${summary.baseCurrency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  drawLetterhead(doc, { reportTitle: "Net Worth Statement", userName, subtitle: `As of ${new Date().toLocaleDateString()}` });

  drawExecutiveSummary(doc, executiveSummary.text, executiveSummary.isPlaceholder);

  drawSectionTitle(doc, "Headline");
  drawKeyValueRow(doc, [
    { label: "Total Net Worth", value: money(summary.totalNetWorth), accent: true },
    { label: "Today", value: `${summary.todayChangePct >= 0 ? "+" : ""}${summary.todayChangePct.toFixed(2)}%` },
    { label: "This Month", value: `${summary.monthChangePct >= 0 ? "+" : ""}${summary.monthChangePct.toFixed(2)}%` },
    { label: "This Year", value: `${summary.yearChangePct >= 0 ? "+" : ""}${summary.yearChangePct.toFixed(2)}%` },
  ]);

  drawSectionTitle(doc, "Asset Allocation");
  if (summary.assetAllocation.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text("No assets recorded yet.");
    doc.moveDown(0.6);
  } else {
    drawTable(
      doc,
      [
        { header: "Asset Class", width: 0.5 },
        { header: "Value", width: 0.25, align: "right" },
        { header: "% of Portfolio", width: 0.25, align: "right" },
      ],
      summary.assetAllocation.map((a) => [a.category, money(a.valueInBase), `${a.percentage.toFixed(1)}%`]),
    );
  }

  drawSectionTitle(doc, "Currency Exposure");
  if (summary.currencyExposure.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text("No currency exposure recorded yet.");
  } else {
    drawTable(
      doc,
      [
        { header: "Currency", width: 0.4 },
        { header: "Value", width: 0.3, align: "right" },
        { header: "% of Portfolio", width: 0.3, align: "right" },
      ],
      summary.currencyExposure.map((c) => [c.currency, money(c.valueInBase), `${c.percentage.toFixed(1)}%`]),
    );
  }

  drawSectionTitle(doc, "Financial Health");
  drawKeyValueRow(doc, [
    { label: "Emergency Fund (months)", value: summary.emergencyFundHealth.toFixed(1) },
    { label: "Debt Ratio", value: `${(summary.debtRatio * 100).toFixed(1)}%` },
  ]);

  return finish();
}
