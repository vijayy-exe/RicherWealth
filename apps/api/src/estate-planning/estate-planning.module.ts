import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { HouseholdModule } from "../household/household.module";
import { EstatePlanningController } from "./estate-planning.controller";
import { EstatePlanningService } from "./estate-planning.service";

/**
 * Phase 21: nominee/beneficiary/trust records, the asset-transfer
 * checklist, and the missing-nominee checklist. Imports HouseholdModule
 * for HouseholdAccessService — the same view/edit rules AssetsService uses
 * — rather than a separate copy of the RBAC logic.
 */
@Module({
  imports: [PrismaModule, HouseholdModule],
  controllers: [EstatePlanningController],
  providers: [EstatePlanningService],
  exports: [EstatePlanningService],
})
export class EstatePlanningModule {}
