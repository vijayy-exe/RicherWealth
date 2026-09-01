import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { StocksModule } from "../stocks/stocks.module";

import { EtfsController } from "./etfs.controller";
import { EtfsService } from "./etfs.service";

@Module({
  imports: [PrismaModule, NetWorthModule, StocksModule],
  controllers: [EtfsController],
  providers: [EtfsService],
  exports: [EtfsService],
})
export class EtfsModule {}
