import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NetWorthModule } from "../net-worth/net-worth.module";
import { HouseholdController } from "./household.controller";
import { HouseholdService } from "./household.service";
import { HouseholdAccessService } from "./household-access.service";

/**
 * Phase 21: builds real household CRUD/membership/net-worth logic on top
 * of Phase 1's schema-only Household/HouseholdMember/HouseholdRoleGuard
 * scaffold. HouseholdAccessService is exported for EstatePlanningModule
 * (and the Assets module) to reuse the same view/edit rules rather than
 * re-implementing them.
 */
@Module({
  imports: [PrismaModule, NetWorthModule],
  controllers: [HouseholdController],
  providers: [HouseholdService, HouseholdAccessService],
  exports: [HouseholdAccessService, HouseholdService],
})
export class HouseholdModule {}
