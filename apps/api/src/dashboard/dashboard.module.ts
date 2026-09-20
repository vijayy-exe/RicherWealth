import { Module } from "@nestjs/common";
import { DashboardResolver } from "./dashboard.resolver";
import { DashboardGateway } from "./dashboard.gateway";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { AuthModule } from "../auth/auth.module";
import { LiabilitiesModule } from "../liabilities/liabilities.module";
import { IncomeModule } from "../income/income.module";

// Fix Audit M-02: TransactionsModule was only imported here for
// DashboardResolver's own (now-removed) duplicate emergency-fund-health
// computation -- NetWorthService (via NetWorthModule) now depends on
// TransactionsModule directly and computes this once, correctly.
@Module({
  imports: [NetWorthModule, AuthModule, LiabilitiesModule, IncomeModule],
  providers: [DashboardResolver, DashboardGateway],
})
export class DashboardModule {}
