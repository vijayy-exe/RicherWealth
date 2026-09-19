import type { DashboardSummary } from "../../net-worth/net-worth.service";
import type { RiskProfile } from "../../risk/risk-engine.service";
import { isInsufficientRiskSubScore } from "../../risk/risk-scoring";
import type { WealthHealthScore } from "../../wealth/wealth-health.service";
import { isInsufficientWealthHealthSubScore } from "../../wealth/wealth-health-scoring";
import type { WealthDnaProfileResult, WealthDnaInsufficientData } from "../../wealth/wealth-dna.service";
import type { ScenarioSimulationResult } from "../../wealth/scenario-simulator.service";
import type { TimeMachinePastState, TimeMachineInsufficientData } from "../../wealth/time-machine.service";
import type { GoalWithProgress } from "../../goals/goals.service";
import type { HarvestingCandidate, TaxReport } from "@richer/shared-types";
import { newDocument, drawLetterhead, drawSectionTitle, drawKeyValueRow, drawTable, drawExecutiveSummary, drawRule } from "./pdf-template.util";

export interface SuggestionLite {
  id: string;
  type: string;
  title: string;
  description: string;
}

export interface HealthAuditScenarioResult {
  label: string;
  result: ScenarioSimulationResult;
}

export interface HealthAuditData {
  userName: string | null;
  baseCurrency: string;
  netWorthSummary: DashboardSummary;
  allocation: unknown; // Phase 11 quant response — read defensively, same convention as portfolio-analytics.pdf.ts
  riskProfile: RiskProfile;
  wealthHealth: WealthHealthScore;
  wealthDna: WealthDnaProfileResult | WealthDnaInsufficientData;
  harvestCandidates: HarvestingCandidate[];
  taxReport: TaxReport | null;
  goals: GoalWithProgress[];
  goalProbabilities: Array<{ goal: GoalWithProgress; probabilityOfTarget: number | null; requiredMonthlyContribution: number | null }>;
  opportunities: SuggestionLite[];
  scenarios: HealthAuditScenarioResult[];
  pastState: TimeMachinePastState | TimeMachineInsufficientData;
}

export interface HealthAuditExecutiveSummaries {
  overall: { text: string; isPlaceholder: boolean };
  netWorth: { text: string; isPlaceholder: boolean };
  risk: { text: string; isPlaceholder: boolean };
  wealthHealth: { text: string; isPlaceholder: boolean };
  goals: { text: string; isPlaceholder: boolean };
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Phase 20 — One-Click Financial Health Audit. Every section below reads
 * from ONE real upstream field already computed by an existing service
 * (see `ReportsService.generateHealthAudit` for exactly which call feeds
 * which section — the same "traced to one real call" discipline
 * `net-worth-statement.pdf.ts` established in Phase 18). No section
 * fabricates a number that isn't present in `data`; a section with no data
 * renders an honest empty/insufficient-data state instead, same as every
 * other report in this directory.
 */
export async function buildHealthAuditPdf(data: HealthAuditData, summaries: HealthAuditExecutiveSummaries): Promise<Buffer> {
  const { doc, finish } = newDocument();
  const money = (n: number) => `${data.baseCurrency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  drawLetterhead(doc, { reportTitle: "One-Click Financial Health Audit", userName: data.userName, subtitle: `As of ${new Date().toLocaleDateString()}` });
  drawExecutiveSummary(doc, summaries.overall.text, summaries.overall.isPlaceholder);

  drawNetWorthSection(doc, data, money, summaries.netWorth);
  drawAllocationSection(doc, data, money);
  drawRiskSection(doc, data, summaries.risk);
  drawWealthHealthSection(doc, data, summaries.wealthHealth);
  drawWealthDnaSection(doc, data);
  drawTaxSection(doc, data, money);
  drawGoalsSection(doc, data, money, summaries.goals);
  drawOpportunitiesSection(doc, data);
  drawScenariosSection(doc, data, money);
  drawTimeMachineSection(doc, data, money);
  drawInsuranceSection(doc, data);

  return finish();
}

function emptyState(doc: ReturnType<typeof newDocument>["doc"], text: string): void {
  doc.font("Helvetica").fontSize(9).fillColor("#6B7280").text(text);
  doc.moveDown(0.6);
}

// ─── 1. Net worth trend ──────────────────────────────────────────────────

function drawNetWorthSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, money: (n: number) => string, summary: { text: string; isPlaceholder: boolean }): void {
  drawSectionTitle(doc, "1. Net Worth");
  const s = data.netWorthSummary;
  drawKeyValueRow(doc, [
    { label: "Total Net Worth", value: money(s.totalNetWorth), accent: true },
    { label: "This Month", value: `${s.monthChangePct >= 0 ? "+" : ""}${s.monthChangePct.toFixed(2)}%` },
    { label: "This Year", value: `${s.yearChangePct >= 0 ? "+" : ""}${s.yearChangePct.toFixed(2)}%` },
    { label: "Debt Ratio", value: `${(s.debtRatio * 100).toFixed(1)}%` },
  ]);
  doc.font("Helvetica").fontSize(9).fillColor("#1A1F2E").text(summary.isPlaceholder ? `[PLACEHOLDER] ${summary.text}` : summary.text);
  doc.moveDown(0.8);
}

// ─── 2. Allocation & diversification (Phase 11) ─────────────────────────

function drawAllocationSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, money: (n: number) => string): void {
  drawSectionTitle(doc, "2. Portfolio Allocation");
  const alloc = data.allocation as { totalValue?: number; overallDiversificationScore?: number } | null;
  if (!alloc || num(alloc.totalValue) === 0) {
    emptyState(doc, "No holdings recorded yet.");
    return;
  }
  drawKeyValueRow(doc, [
    { label: "Portfolio Value", value: money(num(alloc.totalValue)), accent: true },
    { label: "Diversification Score", value: `${num(alloc.overallDiversificationScore).toFixed(0)} / 100` },
  ]);
  if (data.netWorthSummary.assetAllocation.length > 0) {
    drawTable(
      doc,
      [{ header: "Asset Class", width: 0.5 }, { header: "Value", width: 0.25, align: "right" }, { header: "% of Portfolio", width: 0.25, align: "right" }],
      data.netWorthSummary.assetAllocation.map((a) => [a.category, money(a.valueInBase), `${a.percentage.toFixed(1)}%`]),
    );
  }
}

// ─── 3. Risk profile (Phase 12) ──────────────────────────────────────────

function drawRiskSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, summary: { text: string; isPlaceholder: boolean }): void {
  drawSectionTitle(doc, "3. Risk Profile");
  const { riskProfile } = data;
  if (riskProfile.overallScore === null) {
    emptyState(doc, "Not enough data yet to compute a risk profile.");
    return;
  }
  drawKeyValueRow(doc, [{ label: "Overall Risk Score", value: `${riskProfile.overallScore.toFixed(0)} / 100`, accent: true }]);
  const rows = riskProfile.subScores
    .filter((s) => !isInsufficientRiskSubScore(s))
    .map((s) => (isInsufficientRiskSubScore(s) ? [] : [s.label, `${s.score.toFixed(0)} / 100`, s.level]));
  if (rows.length > 0) {
    drawTable(doc, [{ header: "Dimension", width: 0.4 }, { header: "Score", width: 0.3, align: "right" }, { header: "Level", width: 0.3, align: "right" }], rows as string[][]);
  }
  doc.font("Helvetica").fontSize(9).fillColor("#1A1F2E").text(summary.isPlaceholder ? `[PLACEHOLDER] ${summary.text}` : summary.text);
  doc.moveDown(0.8);
}

// ─── 4. Wealth Health Score (Phase 20) ───────────────────────────────────

function drawWealthHealthSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, summary: { text: string; isPlaceholder: boolean }): void {
  drawSectionTitle(doc, "4. Wealth Health Score");
  const { wealthHealth } = data;
  if (wealthHealth.overallScore === null) {
    emptyState(doc, "Not enough data yet to compute a Wealth Health Score.");
    return;
  }
  drawKeyValueRow(doc, [{ label: "Wealth Health Score", value: `${wealthHealth.overallScore.toFixed(0)} / 100`, accent: true }]);
  const rows = wealthHealth.subScores
    .filter((s) => !isInsufficientWealthHealthSubScore(s))
    .map((s) => (isInsufficientWealthHealthSubScore(s) ? [] : [s.label, `${s.score.toFixed(0)} / 100`, s.level]));
  if (rows.length > 0) {
    drawTable(doc, [{ header: "Dimension", width: 0.4 }, { header: "Score", width: 0.3, align: "right" }, { header: "Level", width: 0.3, align: "right" }], rows as string[][]);
  }
  doc.font("Helvetica").fontSize(9).fillColor("#1A1F2E").text(summary.isPlaceholder ? `[PLACEHOLDER] ${summary.text}` : summary.text);
  doc.font("Helvetica").fontSize(7.5).fillColor("#6B7280").text("Methodology: see WEALTH_HEALTH_METHODOLOGY.md.");
  doc.moveDown(0.8);
}

// ─── 5. Wealth DNA (Phase 20) ─────────────────────────────────────────────

function drawWealthDnaSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData): void {
  drawSectionTitle(doc, "5. Wealth DNA");
  const dna = data.wealthDna;
  if ("insufficientData" in dna) {
    emptyState(doc, dna.reason);
    return;
  }
  drawKeyValueRow(doc, [{ label: "Archetype", value: dna.archetype, accent: true }]);
  doc.font("Helvetica").fontSize(9).fillColor("#1A1F2E").text(dna.narrative);
  doc.moveDown(0.8);
}

// ─── 6. Tax & tax-loss harvesting (Phase 15) ─────────────────────────────

function drawTaxSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, money: (n: number) => string): void {
  drawSectionTitle(doc, "6. Tax & Harvesting Opportunities");
  if (data.taxReport) {
    drawKeyValueRow(doc, [
      { label: "Financial Year", value: data.taxReport.financialYear },
      { label: "Total Estimated Tax", value: money(data.taxReport.totalEstimatedTax), accent: true },
    ]);
  }
  if (data.harvestCandidates.length === 0) {
    emptyState(doc, "No tax-loss-harvesting candidates found.");
  } else {
    drawTable(
      doc,
      [
        { header: "Holding", width: 0.4 },
        { header: "Unrealized Loss", width: 0.3, align: "right" },
        { header: "Est. Tax Saving", width: 0.3, align: "right" },
      ],
      data.harvestCandidates.map((c) => [c.lot.displayName, money(c.unrealizedLoss), money(c.estimatedTaxSaving)]),
    );
  }
}

// ─── 7. Goals (Phase 13) ──────────────────────────────────────────────────

function drawGoalsSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, money: (n: number) => string, summary: { text: string; isPlaceholder: boolean }): void {
  drawSectionTitle(doc, "7. Goals");
  if (data.goalProbabilities.length === 0) {
    emptyState(doc, "No active goals set yet.");
    return;
  }
  drawTable(
    doc,
    [
      { header: "Goal", width: 0.35 },
      { header: "Target", width: 0.2, align: "right" },
      { header: "Progress", width: 0.15, align: "right" },
      { header: "Success Probability", width: 0.3, align: "right" },
    ],
    data.goalProbabilities.map(({ goal, probabilityOfTarget }) => [
      goal.name,
      money(Number(goal.targetAmount.toString())),
      `${goal.percentComplete.toFixed(0)}%`,
      probabilityOfTarget === null ? "N/A" : `${(probabilityOfTarget * 100).toFixed(0)}%`,
    ]),
  );
  doc.font("Helvetica").fontSize(9).fillColor("#1A1F2E").text(summary.isPlaceholder ? `[PLACEHOLDER] ${summary.text}` : summary.text);
  doc.moveDown(0.8);
}

// ─── 8. Opportunities (Phase 20 Opportunity Scanner + AI CFO) ───────────

function drawOpportunitiesSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData): void {
  drawSectionTitle(doc, "8. Opportunities");
  if (data.opportunities.length === 0) {
    emptyState(doc, "No active suggestions right now.");
    return;
  }
  for (const s of data.opportunities) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1A1F2E").text(`${s.title} (${s.type})`);
    doc.font("Helvetica").fontSize(8.5).fillColor("#6B7280").text(s.description);
    doc.moveDown(0.4);
  }
  doc.moveDown(0.4);
}

// ─── 9. Scenarios (Phase 20 Digital Twin) ────────────────────────────────

function drawScenariosSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, money: (n: number) => string): void {
  drawSectionTitle(doc, "9. Scenario Projections");
  if (data.scenarios.length === 0) {
    emptyState(doc, "No scenario projections available.");
    return;
  }
  const rows: string[][] = [];
  for (const { label, result } of data.scenarios) {
    for (const [suffix, stats] of [
      ["Baseline", result.baseline.finalValueStats],
      [`Scenario`, result.scenario.finalValueStats],
    ] as const) {
      const pctChange = result.initialValue > 0 ? ((stats.mean - result.initialValue) / result.initialValue) * 100 : 0;
      rows.push([`${label} — ${suffix}`, money(stats.mean), `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`]);
    }
  }
  drawTable(
    doc,
    [
      { header: "Scenario", width: 0.4 },
      { header: "Mean Final Value", width: 0.3, align: "right" },
      { header: "vs. Initial", width: 0.3, align: "right" },
    ],
    rows,
  );
}

// ─── 10. History / Time Machine (Phase 20) ───────────────────────────────

function drawTimeMachineSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData, money: (n: number) => string): void {
  drawSectionTitle(doc, "10. Wealth History");
  const past = data.pastState;
  if ("insufficientData" in past) {
    emptyState(doc, past.reason);
    return;
  }
  drawKeyValueRow(doc, [
    { label: `Net Worth (${past.snapshotDate})`, value: money(past.netWorth) },
    { label: "Today", value: money(data.netWorthSummary.totalNetWorth), accent: true },
  ]);
  doc.font("Helvetica").fontSize(7.5).fillColor("#6B7280").text("Past asset-allocation breakdown is approximate (see the Financial Time Machine).");
  doc.moveDown(0.8);
}

// ─── 11. Insurance adequacy (reuses the Wealth Health Score sub-score) ──

function drawInsuranceSection(doc: ReturnType<typeof newDocument>["doc"], data: HealthAuditData): void {
  drawSectionTitle(doc, "11. Insurance Adequacy");
  const insuranceSub = data.wealthHealth.subScores.find((s) => s.key === "insurance");
  if (!insuranceSub || isInsufficientWealthHealthSubScore(insuranceSub)) {
    emptyState(doc, insuranceSub && "reason" in insuranceSub ? insuranceSub.reason : "Not enough data yet.");
    return;
  }
  drawKeyValueRow(doc, [{ label: "Insurance Adequacy Score", value: `${insuranceSub.score.toFixed(0)} / 100`, accent: true }]);
  doc.font("Helvetica").fontSize(9).fillColor("#1A1F2E").text(insuranceSub.explanation);
  drawRule(doc);
}
