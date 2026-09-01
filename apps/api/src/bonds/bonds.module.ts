import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { ForexModule } from "../forex/forex.module";

import { BondsController } from "./bonds.controller";
import { BondsService } from "./bonds.service";

@Module({
  imports: [PrismaModule, NetWorthModule, ForexModule],
  controllers: [BondsController],
  providers: [BondsService],
  exports: [BondsService],
})
export class BondsModule {}
