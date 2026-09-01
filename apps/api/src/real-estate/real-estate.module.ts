import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { StocksModule } from "../stocks/stocks.module"; // for MemoryCacheService

import { RealEstateController } from "./real-estate.controller";
import { RealEstateService } from "./real-estate.service";
import { GeocodingService } from "./geocoding.service";

@Module({
  imports: [PrismaModule, NetWorthModule, StocksModule],
  controllers: [RealEstateController],
  providers: [RealEstateService, GeocodingService],
  exports: [RealEstateService, GeocodingService],
})
export class RealEstateModule {}
