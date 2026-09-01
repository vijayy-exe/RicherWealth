import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { ForexModule } from "../forex/forex.module";

@Module({
  imports: [NetWorthModule, ForexModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
