import type { DashboardSummary } from "../../net-worth/net-worth.service";
import { newDocument, drawLetterhead, drawSectionTitle, drawKeyValueRow, drawTable, drawExecutiveSummary } from "./pdf-template.util";

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * A one-page-ish composite of the other three reports' data — assembled
 * from the SAME three service calls (NetWorthService.getDashboardSummary,
 * AnalyticsService.getAllocation/getRiskMetrics), never a fourth
 * independent computation.
 */
export async function buildFinancialSnapshotPdf(
  data: { summary: DashboardSummary; allocation: unknown; riskMetrics: unknown; userName: string | null },
  executiveSummary: { text: string; isPlaceholder: boolean },
): Promise<Buffer> {
  const { doc, finish } = newDocument();
  const { summary } = data;
  const money = (n: number) => `${summary.baseCurrency} ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  drawLetterhead(doc, { reportTitle: "Financial Snapshot", userName: data.userName, subtitle: `As of ${new Date().toLocaleDateString()}` });

  drawExecutiveSummary(doc, executiveSummary.text, executiveSummary.isPlaceholder);

  drawSectionTitle(doc, "Net Worth");
  drawKeyValueRow(doc, [
    { label: "Total Net Worth", value: money(summary.totalNetWorth), accent: true },
    { label: "This Month", value: `${summary.monthChangePct >= 0 ? "+" : ""}${summary.monthChangePct.toFixed(1)}%` },
    { label: "This Year", value: `${summary.yearChangePct >= 0 ? "+" : ""}${summary.yearChangePct.toFixed(1)}%` },
  ]);

  drawSectionTitle(doc, "Top Holdings by Asset Class");
  if (summary.assetAllocation.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text("No assets recorded yet.");
    doc.moveDown(0.6);
  } else {
    const top = [...summary.assetAllocation].sort((a, b) => b.valueInBase - a.valueInBase).slice(0, 8);
    drawTable(
      doc,
      [
        { header: "Asset Class", width: 0.5 },
        { header: "Value", width: 0.25, align: "right" },
        { header: "% of Portfolio", width: 0.25, align: "right" },
      ],
      top.map((a) => [a.category, money(a.valueInBase), `${a.percentage.toFixed(1)}%`]),
    );
  }

  const alloc = data.allocation as { overallDiversificationScore?: number } | null;
  const risk = data.riskMetrics as { insufficientData?: boolean; sharpeRatio?: number; volatilityAnnualized?: number } | null;

  drawSectionTitle(doc, "Portfolio Health");
  if ((!alloc || summary.assetAllocation.length === 0) && (!risk || risk.insufficientData)) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6B7280").text("Not enough data yet for diversification/risk metrics.");
  } else {
    drawKeyValueRow(doc, [
      { label: "Diversification Score", value: alloc ? `${num(alloc.overallDiversificationScore).toFixed(0)} / 100` : "—" },
      { label: "Sharpe Ratio", value: risk && !risk.insufficientData ? num(risk.sharpeRatio).toFixed(2) : "—" },
      { label: "Ann. Volatility", value: risk && !risk.insufficientData ? `${num(risk.volatilityAnnualized).toFixed(1)}%` : "—" },
      { label: "Emergency Fund", value: `${summary.emergencyFundHealth.toFixed(1)} mo` },
    ]);
  }

  return finish();
}
