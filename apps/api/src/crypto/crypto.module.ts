import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { StocksModule } from "../stocks/stocks.module"; // for MemoryCacheService
import { ForexModule } from "../forex/forex.module";

import { CryptoPublicController, CryptoController } from "./crypto.controller";
import { CryptoService } from "./crypto.service";
import { CryptoPriceSyncService } from "./crypto-price-sync.service";
import { CryptoPriceSyncScheduler } from "./crypto-price-sync.scheduler";

@Module({
  imports: [PrismaModule, NetWorthModule, StocksModule, ForexModule],
  controllers: [CryptoPublicController, CryptoController],
  providers: [CryptoService, CryptoPriceSyncService, CryptoPriceSyncScheduler],
  exports: [CryptoService, CryptoPriceSyncService],
})
export class CryptoModule {}
