import { Module } from "@nestjs/common";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { TaxModule } from "../tax/tax.module";
import { AssetsModule } from "../assets/assets.module";
import { LiabilitiesModule } from "../liabilities/liabilities.module";
import { TransactionsModule } from "../transactions/transactions.module";
import { StocksModule } from "../stocks/stocks.module";
import { AiModule } from "../ai/ai.module";

import { ReportsController } from "./reports.controller";
import { ExportController } from "./export.controller";
import { ReportsService } from "./reports.service";
import { ExcelExportService } from "./excel-export.service";
import { EXECUTIVE_SUMMARY_PROVIDER } from "./executive-summary.provider";
import { LlmExecutiveSummaryProvider } from "./llm-executive-summary.provider";

/**
 * AiModule imported here (one-way: ReportsModule -> AiModule) to get a real
 * LlmOrchestratorService for LlmExecutiveSummaryProvider. AiModule has no
 * dependency back on ReportsModule, so this doesn't create a cycle.
 */
@Module({
  imports: [NetWorthModule, AnalyticsModule, TaxModule, AssetsModule, LiabilitiesModule, TransactionsModule, StocksModule, AiModule],
  controllers: [ReportsController, ExportController],
  providers: [
    ReportsService,
    ExcelExportService,
    { provide: EXECUTIVE_SUMMARY_PROVIDER, useClass: LlmExecutiveSummaryProvider },
  ],
  exports: [ExcelExportService],
})
export class ReportsModule {}
