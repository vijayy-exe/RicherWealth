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
  // RiskFreeRateService is also exported for Phase 12's RiskEngineModule
  // (reuses the same FRED DGS3MO rate as its interest-rate-risk macro
  // input), and QuantClientService for Phase 13's GoalsModule (reuses the
  // same Monte Carlo engine for goal success-probability simulation).
  exports: [AnalyticsService, RiskFreeRateService, QuantClientService],
})
export class AnalyticsModule {}
