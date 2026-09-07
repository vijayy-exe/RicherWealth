import { newDocument, drawLetterhead, drawSectionTitle, drawKeyValueRow, drawExecutiveSummary } from "./pdf-template.util";

/** getAllocation/getRiskMetrics return loosely-typed objects from the Python
 * quant microservice (Phase 11) — read defensively rather than assuming an
 * exact shape, and render an honest "insufficient data" note when the
 * service itself reports one (never fabricate a number in its place). */
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export async function buildPortfolioAnalyticsPdf(
  data: { allocation: unknown; riskMetrics: unknown; userName: string | null; baseCurrency: string },
  executiveSummary: { text: string; isPlaceholder: boolean },
): Promise<Buffer> {
  const { doc, finish } = newDocument();
  drawLetterhead(doc, { reportTitle: "Portfolio Analytics Summary", userName: data.userName, subtitle: `As of ${new Date().toLocaleDateString()}` });

  drawExecutiveSummary(doc, executiveSummary.text, executiveSummary.isPlaceholder);

  const alloc = data.allocation as { totalValue?: number; overallDiversificationScore?: number } | null;
  drawSectionTitle(doc, "Diversification");
  if (!alloc || num(alloc.totalValue) === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text("No holdings recorded yet.");
    doc.moveDown(0.6);
  } else {
    drawKeyValueRow(doc, [
      { label: "Portfolio Value", value: `${data.baseCurrency} ${num(alloc.totalValue).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, accent: true },
      { label: "Diversification Score", value: `${num(alloc.overallDiversificationScore).toFixed(0)} / 100` },
    ]);
  }

  const risk = data.riskMetrics as {
    insufficientData?: boolean;
    reason?: string;
    sharpeRatio?: number;
    sortinoRatio?: number;
    beta?: number;
    alpha?: number;
    volatilityAnnualized?: number;
    maxDrawdown?: number;
  } | null;

  drawSectionTitle(doc, "Risk Metrics");
  if (!risk || risk.insufficientData) {
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6B7280").text(
      `Not enough historical data to compute risk metrics yet${risk?.reason ? ` (${risk.reason})` : ""}.`,
    );
    doc.moveDown(0.6);
  } else {
    drawKeyValueRow(doc, [
      { label: "Sharpe Ratio", value: num(risk.sharpeRatio).toFixed(2) },
      { label: "Sortino Ratio", value: num(risk.sortinoRatio).toFixed(2) },
      { label: "Beta", value: num(risk.beta).toFixed(2) },
      { label: "Alpha", value: `${num(risk.alpha).toFixed(2)}%` },
    ]);
    drawKeyValueRow(doc, [
      { label: "Annualized Volatility", value: `${num(risk.volatilityAnnualized).toFixed(1)}%` },
      { label: "Max Drawdown", value: `${num(risk.maxDrawdown).toFixed(1)}%` },
    ]);
  }

  return finish();
}
