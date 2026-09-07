import { BadRequestException, Controller, Get, Query, Res, UseGuards, Request } from "@nestjs/common";
import type { Response } from "express";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { ExcelExportService, type ExportColumn } from "./excel-export.service";
import { AssetsService } from "../assets/assets.service";
import { LiabilitiesService } from "../liabilities/liabilities.service";
import { TransactionsService } from "../transactions/transactions.service";
import { StocksService } from "../stocks/stocks.service";

interface AuthRequest {
  user: { id: string };
}

type Format = "xlsx" | "csv";

/**
 * The one, consistent "Export" action every AG Grid page in the app can
 * point at — each route calls the SAME service method the page's own table
 * already calls (AssetsService.findAll, LiabilitiesService.findAll,
 * TransactionsService.findAll, StocksService.listHoldings), so an export
 * can never show different rows than what's on screen. Covers the AG Grid
 * pages confirmed present as of this phase: assets, liabilities,
 * transactions, stocks. (liabilities/[id]'s nested amortization-schedule
 * grid is NOT covered — a detail-view sub-table, lower priority, noted as
 * a gap rather than silently left out.)
 */
@Controller("reports/export")
@UseGuards(SupabaseAuthGuard)
export class ExportController {
  constructor(
    private readonly excel: ExcelExportService,
    private readonly assets: AssetsService,
    private readonly liabilities: LiabilitiesService,
    private readonly transactions: TransactionsService,
    private readonly stocks: StocksService,
  ) {}

  private async send(res: Response, format: string | undefined, columns: ExportColumn[], rows: Array<Record<string, unknown>>, filenameBase: string) {
    const fmt = (format ?? "xlsx") as Format;
    if (fmt !== "xlsx" && fmt !== "csv") throw new BadRequestException('format must be "xlsx" or "csv"');

    if (fmt === "csv") {
      const csv = this.excel.buildCsv(columns, rows);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
      res.send(csv);
      return;
    }
    const buffer = await this.excel.buildWorkbook(columns, rows, filenameBase);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
    res.send(buffer);
  }

  @Get("assets")
  async exportAssets(@Request() req: AuthRequest, @Res() res: Response, @Query("format") format?: string) {
    const rows = await this.assets.findAll(req.user.id);
    const columns: ExportColumn[] = [
      { key: "name", header: "Name", type: "string" },
      { key: "type", header: "Type", type: "string" },
      { key: "currentValue", header: "Current Value", type: "currency" },
      { key: "currencyCode", header: "Currency", type: "string" },
    ];
    await this.send(res, format, columns, rows as unknown as Array<Record<string, unknown>>, "richerwealth-assets");
  }

  @Get("liabilities")
  async exportLiabilities(@Request() req: AuthRequest, @Res() res: Response, @Query("format") format?: string) {
    const rows = await this.liabilities.findAll(req.user.id);
    const columns: ExportColumn[] = [
      { key: "name", header: "Name", type: "string" },
      { key: "type", header: "Type", type: "string" },
      { key: "principalAmount", header: "Principal", type: "currency" },
      { key: "remainingBalance", header: "Remaining Balance", type: "currency" },
      { key: "interestRate", header: "Interest Rate %", type: "number" },
      { key: "emiAmount", header: "EMI", type: "currency" },
      { key: "currencyCode", header: "Currency", type: "string" },
      { key: "dueDate", header: "Due Date", type: "date" },
    ];
    await this.send(res, format, columns, rows as unknown as Array<Record<string, unknown>>, "richerwealth-liabilities");
  }

  @Get("transactions")
  async exportTransactions(@Request() req: AuthRequest, @Res() res: Response, @Query("format") format?: string) {
    const rows = await this.transactions.findAll(req.user.id, {} as never);
    const columns: ExportColumn[] = [
      { key: "date", header: "Date", type: "date" },
      { key: "type", header: "Type", type: "string" },
      { key: "category", header: "Category", type: "string" },
      { key: "merchant", header: "Merchant", type: "string" },
      { key: "description", header: "Description", type: "string" },
      { key: "amount", header: "Amount", type: "currency" },
      { key: "currencyCode", header: "Currency", type: "string" },
    ];
    await this.send(res, format, columns, rows as unknown as Array<Record<string, unknown>>, "richerwealth-transactions");
  }

  @Get("stocks")
  async exportStocks(@Request() req: AuthRequest, @Res() res: Response, @Query("format") format?: string) {
    const rows = await this.stocks.listHoldings(req.user.id);
    const flattened = rows.map((r) => ({
      ticker: r.ticker,
      exchange: r.exchange,
      quantity: r.quantity,
      avgBuyPrice: r.avgBuyPrice,
      currency: r.currency,
      livePrice: r.analytics?.livePrice ?? null,
      totalGainAbs: r.analytics?.totalGainAbs ?? null,
      totalGainPct: r.analytics?.totalGainPct ?? null,
    }));
    const columns: ExportColumn[] = [
      { key: "ticker", header: "Ticker", type: "string" },
      { key: "exchange", header: "Exchange", type: "string" },
      { key: "quantity", header: "Quantity", type: "number" },
      { key: "avgBuyPrice", header: "Avg Buy Price", type: "currency" },
      { key: "currency", header: "Currency", type: "string" },
      { key: "livePrice", header: "Live Price", type: "currency" },
      { key: "totalGainAbs", header: "Total Gain", type: "currency" },
      { key: "totalGainPct", header: "Total Gain %", type: "number" },
    ];
    await this.send(res, format, columns, flattened, "richerwealth-stocks");
  }
}
