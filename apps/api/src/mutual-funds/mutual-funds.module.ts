import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { ForexModule } from "../forex/forex.module";

import { MutualFundsController, MutualFundsPublicController } from "./mutual-funds.controller";
import { MutualFundsService } from "./mutual-funds.service";
import { NavSyncService } from "./nav-sync.service";
import { NavSyncScheduler } from "./nav-sync.scheduler";
import { XirrService } from "./xirr.service";

@Module({
  imports: [PrismaModule, NetWorthModule, ForexModule],
  controllers: [MutualFundsPublicController, MutualFundsController],
  providers: [MutualFundsService, NavSyncService, NavSyncScheduler, XirrService],
  exports: [MutualFundsService, NavSyncService, XirrService],
})
export class MutualFundsModule {}
