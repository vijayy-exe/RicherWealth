import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { ForexModule } from "../forex/forex.module";
import { HouseholdModule } from "../household/household.module";

@Module({
  imports: [NetWorthModule, ForexModule, HouseholdModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
