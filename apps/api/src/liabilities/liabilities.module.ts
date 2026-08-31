import { Module } from "@nestjs/common";
import { LiabilitiesController } from "./liabilities.controller";
import { LiabilitiesService } from "./liabilities.service";
import { NetWorthModule } from "../net-worth/net-worth.module";

@Module({
  imports: [NetWorthModule],
  controllers: [LiabilitiesController],
  providers: [LiabilitiesService],
  exports: [LiabilitiesService],
})
export class LiabilitiesModule {}
