import { Module } from "@nestjs/common";
import { GoalsController } from "./goals.controller";
import { GoalsService } from "./goals.service";
import { ForexModule } from "../forex/forex.module";
import { AnalyticsModule } from "../analytics/analytics.module";

@Module({
  imports: [ForexModule, AnalyticsModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
