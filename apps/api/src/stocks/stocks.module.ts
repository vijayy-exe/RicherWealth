import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";

import { StocksController, StocksPublicController } from "./stocks.controller";
import { StocksService } from "./stocks.service";
import { PriceSyncService } from "./price-sync.service";
import { PriceSyncScheduler } from "./price-sync.scheduler";
import { AnalyticsService } from "./analytics.service";
import { MemoryCacheService } from "./memory-cache.service";

@Module({
  imports: [
    PrismaModule,
    NetWorthModule,
    ConfigModule,
  ],
  controllers: [StocksPublicController, StocksController],
  providers: [
    StocksService,
    PriceSyncService,
    PriceSyncScheduler,
    AnalyticsService,
    MemoryCacheService,
  ],
  exports: [PriceSyncService, StocksService],
})
export class StocksModule {}
