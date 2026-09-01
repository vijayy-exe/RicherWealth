import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { StocksModule } from "../stocks/stocks.module"; // for MemoryCacheService
import { ForexModule } from "../forex/forex.module";

import { CommoditiesPublicController, CommoditiesController } from "./commodities.controller";
import { CommoditiesService } from "./commodities.service";
import { CommodityPriceSyncService } from "./commodity-price-sync.service";
import { CommodityPriceSyncScheduler } from "./commodity-price-sync.scheduler";

@Module({
  imports: [PrismaModule, NetWorthModule, StocksModule, ForexModule],
  controllers: [CommoditiesPublicController, CommoditiesController],
  providers: [CommoditiesService, CommodityPriceSyncService, CommodityPriceSyncScheduler],
  exports: [CommoditiesService, CommodityPriceSyncService],
})
export class CommoditiesModule {}
