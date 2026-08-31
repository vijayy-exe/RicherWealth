import { Module } from "@nestjs/common";
import { NetWorthService } from "./net-worth.service";
import { NetWorthScheduler } from "./net-worth.scheduler";
import { ForexModule } from "../forex/forex.module";

@Module({
  imports: [ForexModule],
  providers: [NetWorthService, NetWorthScheduler],
  exports: [NetWorthService],
})
export class NetWorthModule {}
