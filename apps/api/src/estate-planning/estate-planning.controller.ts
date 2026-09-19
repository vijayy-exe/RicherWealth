import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { AuditLog } from "../audit/audit-log.decorator";
import { EstatePlanningService } from "./estate-planning.service";
import { createBeneficiarySchema, updateBeneficiarySchema, toggleChecklistStepSchema } from "./dto/estate-planning.dto";

interface AuthRequest {
  user: { id: string };
}

@Controller("estate-planning")
@UseGuards(SupabaseAuthGuard)
export class EstatePlanningController {
  constructor(private readonly estatePlanning: EstatePlanningService) {}

  @Get("checklist")
  getMissingNomineeChecklist(@Request() req: AuthRequest) {
    return this.estatePlanning.getMissingNomineeChecklist(req.user.id);
  }

  @Get("assets/:assetId/beneficiaries")
  listBeneficiaries(@Request() req: AuthRequest, @Param("assetId") assetId: string) {
    return this.estatePlanning.listBeneficiaries(req.user.id, assetId);
  }

  @Post("assets/:assetId/beneficiaries")
  @AuditLog("ESTATE_BENEFICIARY_ADDED", "EstateBeneficiary")
  addBeneficiary(@Request() req: AuthRequest, @Param("assetId") assetId: string, @Body() body: unknown) {
    const dto = createBeneficiarySchema.parse(body);
    return this.estatePlanning.addBeneficiary(req.user.id, assetId, dto);
  }

  @Patch("assets/:assetId/beneficiaries/:beneficiaryId")
  updateBeneficiary(
    @Request() req: AuthRequest,
    @Param("assetId") assetId: string,
    @Param("beneficiaryId") beneficiaryId: string,
    @Body() body: unknown,
  ) {
    const dto = updateBeneficiarySchema.parse(body);
    return this.estatePlanning.updateBeneficiary(req.user.id, assetId, beneficiaryId, dto);
  }

  @Delete("assets/:assetId/beneficiaries/:beneficiaryId")
  removeBeneficiary(
    @Request() req: AuthRequest,
    @Param("assetId") assetId: string,
    @Param("beneficiaryId") beneficiaryId: string,
  ) {
    return this.estatePlanning.removeBeneficiary(req.user.id, assetId, beneficiaryId);
  }

  @Get("assets/:assetId/transfer-checklist")
  getTransferChecklist(@Request() req: AuthRequest, @Param("assetId") assetId: string) {
    return this.estatePlanning.getOrCreateTransferChecklist(req.user.id, assetId);
  }

  @Patch("assets/:assetId/transfer-checklist")
  @AuditLog("ESTATE_TRANSFER_CHECKLIST_UPDATED", "AssetTransferChecklist")
  toggleTransferChecklistStep(@Request() req: AuthRequest, @Param("assetId") assetId: string, @Body() body: unknown) {
    const dto = toggleChecklistStepSchema.parse(body);
    return this.estatePlanning.toggleChecklistStep(req.user.id, assetId, dto);
  }
}
