import { Controller, Get, Query, Res, UseGuards, Request } from "@nestjs/common";
import type { Response } from "express";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { ReportsService } from "./reports.service";

interface AuthRequest {
  user: { id: string };
}

function sendPdf(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}

@Controller("reports")
@UseGuards(SupabaseAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("net-worth-statement")
  async netWorthStatement(@Request() req: AuthRequest, @Res() res: Response) {
    const pdf = await this.reports.generateNetWorthStatement(req.user.id);
    sendPdf(res, pdf, "richerwealth-net-worth-statement.pdf");
  }

  @Get("portfolio-analytics")
  async portfolioAnalytics(@Request() req: AuthRequest, @Res() res: Response) {
    const pdf = await this.reports.generatePortfolioAnalytics(req.user.id);
    sendPdf(res, pdf, "richerwealth-portfolio-analytics.pdf");
  }

  @Get("tax-report")
  async taxReport(
    @Request() req: AuthRequest,
    @Res() res: Response,
    @Query() query: { financialYear?: string; countryCode?: string },
  ) {
    const pdf = await this.reports.generateTaxReport(req.user.id, query.financialYear, query.countryCode ?? "US");
    sendPdf(res, pdf, `richerwealth-tax-report-${query.financialYear ?? "current"}.pdf`);
  }

  @Get("financial-snapshot")
  async financialSnapshot(@Request() req: AuthRequest, @Res() res: Response) {
    const pdf = await this.reports.generateFinancialSnapshot(req.user.id);
    sendPdf(res, pdf, "richerwealth-financial-snapshot.pdf");
  }

  @Get("health-audit")
  async healthAudit(@Request() req: AuthRequest, @Res() res: Response, @Query("countryCode") countryCode = "US") {
    const pdf = await this.reports.generateHealthAudit(req.user.id, countryCode);
    sendPdf(res, pdf, "richerwealth-financial-health-audit.pdf");
  }
}
