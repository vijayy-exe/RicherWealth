import { Controller, Get, Post, Body, Param, Query, UseGuards, Request, Res, BadRequestException } from "@nestjs/common";
import type { Response } from "express";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { TaxLotService } from "./tax-lot.service";
import { CapitalGainsService } from "./capital-gains.service";
import { DividendTaxService } from "./dividend-tax.service";
import { HarvestingService } from "./harvesting.service";
import { ReportService } from "./report.service";
import { recordLotSchema, disposeLotSchema, recordDividendSchema } from "./dto/tax.dto";
import { currentFinancialYear } from "@richer/shared-types";

interface AuthRequest {
  user: { id: string };
}

/**
 * Phase 15: Tax Center. All routes require auth; `countryCode`/`financialYear`
 * are query params (default: US, current FY) rather than a stored user
 * preference — a US-based user with Indian holdings (or vice versa) can
 * view either country's report without a settings round-trip.
 */
@Controller("tax")
@UseGuards(SupabaseAuthGuard)
export class TaxController {
  constructor(
    private readonly taxLots: TaxLotService,
    private readonly capitalGains: CapitalGainsService,
    private readonly dividends: DividendTaxService,
    private readonly harvesting: HarvestingService,
    private readonly reports: ReportService,
  ) {}

  private fy(req: AuthRequest, query: { financialYear?: string; countryCode?: string }) {
    const countryCode = query.countryCode ?? "US";
    const financialYear = query.financialYear ?? currentFinancialYear(countryCode);
    return { countryCode, financialYear };
  }

  @Post("lots")
  async recordLot(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = recordLotSchema.parse(body);
    return this.taxLots.recordBuy(req.user.id, dto);
  }

  @Post("lots/backfill")
  async backfill(@Request() req: AuthRequest) {
    return this.taxLots.backfillFromExistingHoldings(req.user.id);
  }

  @Get("lots")
  async listLots(@Request() req: AuthRequest) {
    return this.taxLots.findOpenLots(req.user.id);
  }

  @Post("lots/:holdingType/:ticker/dispose")
  async dispose(
    @Request() req: AuthRequest,
    @Param("holdingType") holdingType: string,
    @Param("ticker") ticker: string,
    @Body() body: unknown,
    @Query("countryCode") countryCode = "US",
  ) {
    const dto = disposeLotSchema.parse(body);
    return this.capitalGains.disposeLots(req.user.id, holdingType, ticker, dto, countryCode);
  }

  @Post("dividends")
  async recordDividend(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = recordDividendSchema.parse(body);
    return this.dividends.recordDividend(req.user.id, dto);
  }

  @Get("capital-gains")
  async getCapitalGains(@Request() req: AuthRequest, @Query() query: { financialYear?: string; countryCode?: string }) {
    const { countryCode, financialYear } = this.fy(req, query);
    return this.capitalGains.getCapitalGainsSummary(req.user.id, financialYear, countryCode);
  }

  @Get("dividends")
  async getDividends(@Request() req: AuthRequest, @Query() query: { financialYear?: string; countryCode?: string }) {
    const { countryCode, financialYear } = this.fy(req, query);
    return this.dividends.getDividendSummary(req.user.id, financialYear, countryCode);
  }

  @Get("harvesting")
  async getHarvesting(@Request() req: AuthRequest, @Query("countryCode") countryCode = "US") {
    return this.harvesting.getHarvestCandidates(req.user.id, countryCode);
  }

  @Get("report")
  async getReport(@Request() req: AuthRequest, @Query() query: { financialYear?: string; countryCode?: string }) {
    const { countryCode, financialYear } = this.fy(req, query);
    return this.reports.buildReport(req.user.id, financialYear, countryCode);
  }

  @Get("report/download")
  async downloadReport(
    @Request() req: AuthRequest,
    @Res() res: Response,
    @Query() query: { financialYear?: string; countryCode?: string; format?: string },
  ) {
    const { countryCode, financialYear } = this.fy(req, query);
    const format = query.format ?? "csv";
    if (format !== "csv" && format !== "pdf") throw new BadRequestException('format must be "csv" or "pdf"');

    const report = await this.reports.buildReport(req.user.id, financialYear, countryCode);
    const filenameBase = `richerwealth-tax-report-${financialYear}-${countryCode}`;

    if (format === "csv") {
      const csv = this.reports.buildCsv(report);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
      res.send(csv);
      return;
    }

    const pdf = await this.reports.buildPdf(report);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
    res.send(pdf);
  }
}
