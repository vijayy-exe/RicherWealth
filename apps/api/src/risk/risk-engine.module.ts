import { Module } from "@nestjs/common";
import { RiskEngineController } from "./risk-engine.controller";
import { RiskEngineService } from "./risk-engine.service";
import { MacroDataService } from "./macro-data.service";
import { StocksModule } from "../stocks/stocks.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { LiabilitiesModule } from "../liabilities/liabilities.module";
import { AnalyticsModule } from "../analytics/analytics.module";

@Module({
  imports: [StocksModule, NetWorthModule, LiabilitiesModule, AnalyticsModule],
  controllers: [RiskEngineController],
  providers: [RiskEngineService, MacroDataService],
  exports: [RiskEngineService],
})
export class RiskEngineModule {}
