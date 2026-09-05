import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StocksModule } from "../stocks/stocks.module"; // for MemoryCacheService + PriceSyncService
import { ForexModule } from "../forex/forex.module"; // for CurrencyService
import { CommoditiesModule } from "../commodities/commodities.module";
import { PreciousMetalsModule } from "../precious-metals/precious-metals.module";
import { RiskEngineModule } from "../risk/risk-engine.module"; // for MacroDataService

import { MarketIntelligencePublicController, MarketIntelligenceController } from "./market-intelligence.controller";
import { IndicesService } from "./indices.service";
import { CryptoMarketService } from "./crypto-market.service";
import { CommoditiesWidgetService } from "./commodities-widget.service";
import { MoversService } from "./movers.service";
import { RbiRateService } from "./rbi-rate.service";
import { IpoListingService } from "./ipo-listing.service";
import { EconomicCalendarService } from "./economic-calendar.service";

@Module({
  imports: [PrismaModule, StocksModule, ForexModule, CommoditiesModule, PreciousMetalsModule, RiskEngineModule],
  controllers: [MarketIntelligencePublicController, MarketIntelligenceController],
  providers: [
    IndicesService,
    CryptoMarketService,
    CommoditiesWidgetService,
    MoversService,
    RbiRateService,
    IpoListingService,
    EconomicCalendarService,
  ],
  exports: [IndicesService, CryptoMarketService, MoversService],
})
export class MarketIntelligenceModule {}
