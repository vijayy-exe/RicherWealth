import { Resolver, Query, Context } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";

import { DashboardSummaryType } from "./dto/dashboard.types";
import { NetWorthService } from "../net-worth/net-worth.service";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import type { UserWithRelations } from "../auth/auth.service";

interface GqlContext {
  req: { user: UserWithRelations };
}

@Resolver()
export class DashboardResolver {
  constructor(private readonly netWorthService: NetWorthService) {}

  @Query(() => DashboardSummaryType, { description: "Full dashboard summary for the current user" })
  @UseGuards(SupabaseAuthGuard)
  async dashboardSummary(@Context() ctx: GqlContext): Promise<DashboardSummaryType> {
    const userId = ctx.req.user.id;
    return this.netWorthService.getDashboardSummary(userId);
  }
}
