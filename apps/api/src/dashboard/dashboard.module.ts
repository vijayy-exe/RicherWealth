import { Module } from "@nestjs/common";
import { DashboardResolver } from "./dashboard.resolver";
import { DashboardGateway } from "./dashboard.gateway";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { AuthModule } from "../auth/auth.module";
import { LiabilitiesModule } from "../liabilities/liabilities.module";
import { IncomeModule } from "../income/income.module";
import { TransactionsModule } from "../transactions/transactions.module";

@Module({
  imports: [NetWorthModule, AuthModule, LiabilitiesModule, IncomeModule, TransactionsModule],
  providers: [DashboardResolver, DashboardGateway],
})
export class DashboardModule {}
