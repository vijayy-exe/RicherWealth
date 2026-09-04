import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { QuantClientService } from "./quant-client.service";
import { RiskFreeRateService } from "./risk-free-rate.service";
import { MarketDataService } from "./market-data.service";
import { StocksModule } from "../stocks/stocks.module";

@Module({
  imports: [StocksModule], // for MemoryCacheService
  controllers: [AnalyticsController],
  providers: [AnalyticsService, QuantClientService, RiskFreeRateService, MarketDataService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
