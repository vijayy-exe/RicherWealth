import { Module } from "@nestjs/common";
import { NetWorthService } from "./net-worth.service";
import { NetWorthScheduler } from "./net-worth.scheduler";
import { ForexModule } from "../forex/forex.module";
import { TransactionsModule } from "../transactions/transactions.module";

@Module({
  // TransactionsModule: Fix Audit M-02 -- NetWorthService now computes a
  // real trailing-3-month expense average for emergency-fund-health,
  // instead of a hardcoded, currency-blind /50000 placeholder. No circular
  // dependency: TransactionsModule does not import NetWorthModule.
  imports: [ForexModule, TransactionsModule],
  providers: [NetWorthService, NetWorthScheduler],
  exports: [NetWorthService],
})
export class NetWorthModule {}
