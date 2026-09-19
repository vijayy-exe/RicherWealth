import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { HouseholdRoleGuard } from "../auth/guards/household-role.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuditLog } from "../audit/audit-log.decorator";
import { HouseholdService } from "./household.service";
import {
  createHouseholdSchema,
  addHouseholdMemberSchema,
  updateHouseholdMemberRoleSchema,
} from "./dto/household.dto";

interface AuthRequest {
  user: { id: string };
}

/**
 * Phase 21: household CRUD + membership + net-worth views. Membership
 * mutations run `@UseGuards(SupabaseAuthGuard, HouseholdRoleGuard)` +
 * `@Roles("OWNER")` — the first real route HouseholdRoleGuard has ever
 * been attached to (it existed, unused, since Phase 1).
 */
@Controller("household")
@UseGuards(SupabaseAuthGuard)
export class HouseholdController {
  constructor(private readonly household: HouseholdService) {}

  @Post()
  create(@Request() req: AuthRequest, @Body() body: unknown) {
    const dto = createHouseholdSchema.parse(body);
    return this.household.create(req.user.id, dto);
  }

  @Get("mine")
  listMine(@Request() req: AuthRequest) {
    return this.household.listMine(req.user.id);
  }

  @Get(":householdId")
  getOne(@Request() req: AuthRequest, @Param("householdId") householdId: string) {
    return this.household.getOne(req.user.id, householdId);
  }

  @Get(":householdId/net-worth")
  getHouseholdNetWorth(@Request() req: AuthRequest, @Param("householdId") householdId: string) {
    return this.household.getHouseholdNetWorth(req.user.id, householdId);
  }

  @Get(":householdId/members/:userId/net-worth")
  getMemberNetWorth(
    @Request() req: AuthRequest,
    @Param("householdId") householdId: string,
    @Param("userId") userId: string,
  ) {
    return this.household.getMemberNetWorth(req.user.id, householdId, userId);
  }

  @Post(":householdId/members")
  @UseGuards(HouseholdRoleGuard)
  @Roles("OWNER")
  @AuditLog("HOUSEHOLD_MEMBER_ADDED", "Household")
  addMember(@Request() req: AuthRequest, @Param("householdId") householdId: string, @Body() body: unknown) {
    const dto = addHouseholdMemberSchema.parse(body);
    return this.household.addMember(req.user.id, householdId, dto);
  }

  @Patch(":householdId/members/:userId")
  @UseGuards(HouseholdRoleGuard)
  @Roles("OWNER")
  @AuditLog("HOUSEHOLD_MEMBER_ROLE_CHANGED", "Household")
  updateMemberRole(
    @Request() req: AuthRequest,
    @Param("householdId") householdId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const dto = updateHouseholdMemberRoleSchema.parse(body);
    return this.household.updateMemberRole(req.user.id, householdId, userId, dto);
  }

  @Delete(":householdId/members/:userId")
  @UseGuards(HouseholdRoleGuard)
  @Roles("OWNER")
  @AuditLog("HOUSEHOLD_MEMBER_REMOVED", "Household")
  removeMember(
    @Request() req: AuthRequest,
    @Param("householdId") householdId: string,
    @Param("userId") userId: string,
  ) {
    return this.household.removeMember(req.user.id, householdId, userId);
  }
}
