import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { StocksModule } from "../stocks/stocks.module"; // for MemoryCacheService
import { ForexModule } from "../forex/forex.module";

import { PreciousMetalsPublicController, PreciousMetalsController } from "./precious-metals.controller";
import { PreciousMetalsService } from "./precious-metals.service";
import { PreciousMetalPriceSyncService } from "./precious-metal-price-sync.service";
import { PreciousMetalPriceSyncScheduler } from "./precious-metal-price-sync.scheduler";

@Module({
  imports: [PrismaModule, NetWorthModule, StocksModule, ForexModule],
  controllers: [PreciousMetalsPublicController, PreciousMetalsController],
  providers: [PreciousMetalsService, PreciousMetalPriceSyncService, PreciousMetalPriceSyncScheduler],
  exports: [PreciousMetalsService, PreciousMetalPriceSyncService],
})
export class PreciousMetalsModule {}
