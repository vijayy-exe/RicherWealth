import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StocksModule } from "../stocks/stocks.module";
import { CryptoModule } from "../crypto/crypto.module";
import { MutualFundsModule } from "../mutual-funds/mutual-funds.module";
import { StorageModule } from "../storage/storage.module";

import { TaxController } from "./tax.controller";
import { TaxLotService } from "./tax-lot.service";
import { CapitalGainsService } from "./capital-gains.service";
import { DividendTaxService } from "./dividend-tax.service";
import { HarvestingService } from "./harvesting.service";
import { ReportService } from "./report.service";

import { ItrController } from "./itr/itr.controller";
import { ItrService } from "./itr/itr.service";
import { ItrExtractionService } from "./itr/itr-extraction.service";
import { ItrDiscrepancyService } from "./itr/itr-discrepancy.service";

/**
 * Phase 15: Tax Center. Imports StocksModule/CryptoModule/MutualFundsModule
 * only for their already-live price services (PriceSyncService,
 * CryptoPriceSyncService, NavSyncService) — the harvesting scan reuses
 * Phase 4/6/5's price infrastructure rather than adding a fourth fetch path.
 * StorageModule is imported for the ITR upload extension — its
 * StorageService now also serves the private tax-documents bucket
 * (getTaxDocumentUploadUrl/downloadTaxDocument), reusing the same
 * presigned-URL pattern as asset-documents rather than a parallel one.
 */
@Module({
  imports: [PrismaModule, StocksModule, CryptoModule, MutualFundsModule, StorageModule],
  controllers: [TaxController, ItrController],
  providers: [
    TaxLotService, CapitalGainsService, DividendTaxService, HarvestingService, ReportService,
    ItrService, ItrExtractionService, ItrDiscrepancyService,
  ],
  exports: [TaxLotService, CapitalGainsService, DividendTaxService, ReportService, HarvestingService],
})
export class TaxModule {}
