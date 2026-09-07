import { Injectable, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { ReportService as TaxReportService } from "../tax/report.service";
import { currentFinancialYear } from "@richer/shared-types";
import { EXECUTIVE_SUMMARY_PROVIDER, type ExecutiveSummaryProvider } from "./executive-summary.provider";
import { buildNetWorthStatementPdf } from "./pdf/net-worth-statement.pdf";
import { buildPortfolioAnalyticsPdf } from "./pdf/portfolio-analytics.pdf";
import { buildTaxReportPdf } from "./pdf/tax-report.pdf";
import { buildFinancialSnapshotPdf } from "./pdf/financial-snapshot.pdf";

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
}
