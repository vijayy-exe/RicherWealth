import { Module } from "@nestjs/common";
import { BankSyncController } from "./bank-sync.controller";
import { BankSyncService } from "./bank-sync.service";
import { PlaidService } from "./providers/plaid.service";
import { CsvImportProvider } from "./providers/csv-import.provider";
import { PdfImportProvider } from "./providers/pdf-import.provider";
import { TransactionsModule } from "../transactions/transactions.module";

@Module({
  imports: [TransactionsModule],
  controllers: [BankSyncController],
  providers: [BankSyncService, PlaidService, CsvImportProvider, PdfImportProvider],
  exports: [BankSyncService],
})
export class BankSyncModule {}
