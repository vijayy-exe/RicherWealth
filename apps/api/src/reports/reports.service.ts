import { Injectable, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { ReportService as TaxReportService } from "../tax/report.service";
import { HarvestingService } from "../tax/harvesting.service";
import { RiskEngineService } from "../risk/risk-engine.service";
import { GoalsService } from "../goals/goals.service";
import { WealthHealthService } from "../wealth/wealth-health.service";
import { WealthDnaService } from "../wealth/wealth-dna.service";
import { ScenarioSimulatorService } from "../wealth/scenario-simulator.service";
import { TimeMachineService } from "../wealth/time-machine.service";
import { SuggestionEngineService } from "../ai/suggestions/suggestion-engine.service";
import { ScenarioTypeDto } from "../wealth/dto/simulate-scenario.dto";
import { currentFinancialYear } from "@richer/shared-types";
import { EXECUTIVE_SUMMARY_PROVIDER, type ExecutiveSummaryProvider } from "./executive-summary.provider";
import { buildNetWorthStatementPdf } from "./pdf/net-worth-statement.pdf";
import { buildPortfolioAnalyticsPdf } from "./pdf/portfolio-analytics.pdf";
import { buildTaxReportPdf } from "./pdf/tax-report.pdf";
import { buildFinancialSnapshotPdf } from "./pdf/financial-snapshot.pdf";
import { buildHealthAuditPdf, type HealthAuditData, type SuggestionLite } from "./pdf/health-audit.pdf";

const OPPORTUNITY_SCANNER_TYPES = new Set(["DEBT_COST_ALERT", "RETIREMENT_ACCELERATION", "LOW_FEE_ALTERNATIVE", "DIVIDEND_OPPORTUNITY"]);

/**
 * Orchestrates the 4 report types. Every data point comes from an existing
 * domain service's existing method — the same ones the on-screen pages
 * call — so a report can never show a figure that doesn't also appear
 * on-screen (the acceptance criterion this phase is built around).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly analytics: AnalyticsService,
    private readonly taxReports: TaxReportService,
    private readonly harvesting: HarvestingService,
    private readonly riskEngine: RiskEngineService,
    private readonly goals: GoalsService,
    private readonly wealthHealth: WealthHealthService,
    private readonly wealthDna: WealthDnaService,
    private readonly scenarioSimulator: ScenarioSimulatorService,
    private readonly timeMachine: TimeMachineService,
    private readonly suggestions: SuggestionEngineService,
    @Inject(EXECUTIVE_SUMMARY_PROVIDER) private readonly executiveSummary: ExecutiveSummaryProvider,
  ) {}

  private async userName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return user?.name ?? null;
  }

  async generateNetWorthStatement(userId: string): Promise<Buffer> {
    const [summary, userName] = await Promise.all([this.netWorth.getDashboardSummary(userId), this.userName(userId)]);
    const summaryText = await this.executiveSummary.generateSummary({
      reportType: "net-worth-statement",
      headlineFacts: { totalNetWorth: summary.totalNetWorth, monthChangePct: summary.monthChangePct },
    });
    return buildNetWorthStatementPdf(summary, userName, summaryText);
  }

  async generatePortfolioAnalytics(userId: string): Promise<Buffer> {
    const [allocation, riskMetrics, userName, user] = await Promise.all([
      this.analytics.getAllocation(userId),
      this.analytics.getRiskMetrics(userId),
      this.userName(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    const summaryText = await this.executiveSummary.generateSummary({
      reportType: "portfolio-analytics",
      headlineFacts: { totalValue: (allocation as { totalValue?: number })?.totalValue ?? 0 },
    });
    return buildPortfolioAnalyticsPdf(
      { allocation, riskMetrics, userName, baseCurrency: user?.baseCurrency ?? "USD" },
      summaryText,
    );
  }

  async generateTaxReport(userId: string, financialYear?: string, countryCode = "US"): Promise<Buffer> {
    const fy = financialYear ?? currentFinancialYear(countryCode);
    const [report, userName] = await Promise.all([
      this.taxReports.buildReport(userId, fy, countryCode),
      this.userName(userId),
    ]);
    const summaryText = await this.executiveSummary.generateSummary({
      reportType: "tax-report",
      headlineFacts: { totalEstimatedTax: report.totalEstimatedTax, financialYear: fy },
    });
    return buildTaxReportPdf(report, userName, summaryText);
  }

  async generateFinancialSnapshot(userId: string): Promise<Buffer> {
    const [summary, allocation, riskMetrics, userName] = await Promise.all([
      this.netWorth.getDashboardSummary(userId),
      this.analytics.getAllocation(userId),
      this.analytics.getRiskMetrics(userId),
      this.userName(userId),
    ]);
    const summaryText = await this.executiveSummary.generateSummary({
      reportType: "financial-snapshot",
      headlineFacts: { totalNetWorth: summary.totalNetWorth },
    });
    return buildFinancialSnapshotPdf({ summary, allocation, riskMetrics, userName }, summaryText);
  }

  /**
   * Phase 20 — One-Click Financial Health Audit. Every section reads from
   * ONE existing service method already used elsewhere in this app (see the
   * comment beside each call below) — no new computation happens here,
   * only assembly + per-section LLM narration. This is the literal
   * "includes real data from every referenced module, not placeholder
   * text" acceptance criterion.
   */
  async generateHealthAudit(userId: string, countryCode = "US"): Promise<Buffer> {
    const financialYear = currentFinancialYear(countryCode);

    const [
      userName,
      user,
      netWorthSummary,
      allocation,
      riskProfile,
      wealthHealth,
      wealthDna,
      harvestCandidates,
      taxReport,
      goalList,
      activeSuggestions,
      marketCrashScenario,
      earlyRetirementScenario,
      pastState,
    ] = await Promise.all([
      this.userName(userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { baseCurrency: true } }),
      this.netWorth.getDashboardSummary(userId), // Section 1: Net Worth
      this.analytics.getAllocation(userId), // Section 2: Allocation
      this.riskEngine.getRiskProfile(userId), // Section 3: Risk
      this.wealthHealth.getScore(userId, countryCode), // Section 4 + 11: Wealth Health + Insurance
      this.wealthDna.getProfile(userId), // Section 5: Wealth DNA
      this.harvesting.getHarvestCandidates(userId, countryCode).catch(() => []), // Section 6: Tax
      this.taxReports.buildReport(userId, financialYear, countryCode).catch(() => null), // Section 6: Tax
      this.goals.findAll(userId), // Section 7: Goals
      this.suggestions.listActive(userId), // Section 8: Opportunities
      this.scenarioSimulator.simulate(userId, { scenarioType: ScenarioTypeDto.MARKET_CRASH, marketCrashPct: 30 }).catch(() => null), // Section 9: Scenarios
      this.scenarioSimulator.simulate(userId, { scenarioType: ScenarioTypeDto.EARLY_RETIREMENT }).catch(() => null), // Section 9: Scenarios
      this.timeMachine.reconstructPastState(userId, oneYearAgo()), // Section 10: History
    ]);

    const goalProbabilities = await Promise.all(
      goalList.map(async (goal) => {
        const probability = await this.goals.getSuccessProbability(userId, goal.id).catch(() => null);
        if (!probability || "error" in probability) return { goal, probabilityOfTarget: null, requiredMonthlyContribution: null };
        return { goal, probabilityOfTarget: probability.probabilityOfTarget, requiredMonthlyContribution: probability.requiredMonthlyContribution };
      }),
    );

    const opportunities: SuggestionLite[] = activeSuggestions
      .filter((s) => OPPORTUNITY_SCANNER_TYPES.has(s.type))
      .map((s) => ({ id: s.id, type: s.type, title: s.title, description: s.description }));

    const scenarios: HealthAuditData["scenarios"] = [];
    if (marketCrashScenario) scenarios.push({ label: "Market Crash (-30%)", result: marketCrashScenario });
    if (earlyRetirementScenario) scenarios.push({ label: "Early Retirement", result: earlyRetirementScenario });

    const data: HealthAuditData = {
      userName,
      baseCurrency: user?.baseCurrency ?? "USD",
      netWorthSummary,
      allocation,
      riskProfile,
      wealthHealth,
      wealthDna,
      harvestCandidates,
      taxReport,
      goals: goalList,
      goalProbabilities,
      opportunities,
      scenarios,
      pastState,
    };

    const [overallSummary, netWorthSummaryText, riskSummaryText, wealthHealthSummaryText, goalsSummaryText] = await Promise.all([
      this.executiveSummary.generateSummary({
        reportType: "health-audit",
        headlineFacts: {
          totalNetWorth: netWorthSummary.totalNetWorth,
          wealthHealthScore: wealthHealth.overallScore ?? "N/A",
          riskScore: riskProfile.overallScore ?? "N/A",
          wealthDnaArchetype: "archetype" in wealthDna ? wealthDna.archetype : "N/A",
        },
      }),
      this.executiveSummary.generateSummary({
        reportType: "health-audit",
        sectionLabel: "Net Worth",
        headlineFacts: { totalNetWorth: netWorthSummary.totalNetWorth, monthChangePct: netWorthSummary.monthChangePct, yearChangePct: netWorthSummary.yearChangePct },
      }),
      this.executiveSummary.generateSummary({
        reportType: "health-audit",
        sectionLabel: "Risk Profile",
        headlineFacts: { overallRiskScore: riskProfile.overallScore ?? "insufficient data" },
      }),
      this.executiveSummary.generateSummary({
        reportType: "health-audit",
        sectionLabel: "Wealth Health Score",
        headlineFacts: { overallScore: wealthHealth.overallScore ?? "insufficient data" },
      }),
      this.executiveSummary.generateSummary({
        reportType: "health-audit",
        sectionLabel: "Goals",
        headlineFacts: { activeGoals: goalList.length, averagePercentComplete: goalList.length > 0 ? goalList.reduce((s, g) => s + g.percentComplete, 0) / goalList.length : 0 },
      }),
    ]);

    return buildHealthAuditPdf(data, {
      overall: overallSummary,
      netWorth: netWorthSummaryText,
      risk: riskSummaryText,
      wealthHealth: wealthHealthSummaryText,
      goals: goalsSummaryText,
    });
  }
}

function oneYearAgo(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
}
