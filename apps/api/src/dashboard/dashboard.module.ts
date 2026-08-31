import { Module } from "@nestjs/common";
import { DashboardResolver } from "./dashboard.resolver";
import { DashboardGateway } from "./dashboard.gateway";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [NetWorthModule, AuthModule],
  providers: [DashboardResolver, DashboardGateway],
})
export class DashboardModule {}
