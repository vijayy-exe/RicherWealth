import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { HouseholdRole } from "@prisma/client";
import type { Request } from "express";

import { ROLES_KEY } from "../decorators/roles.decorator";
import type { UserWithRelations } from "../auth.service";

/**
 * HouseholdRoleGuard — checks that the caller holds one of the required
 * HouseholdRoles in the target household.
 *
 * Must be used AFTER SupabaseAuthGuard (which sets req.user).
 * The route must also receive a `householdId` param or query param.
 *
 * Usage:
 *   @UseGuards(SupabaseAuthGuard, HouseholdRoleGuard)
 *   @Roles("OWNER")
 *   async deleteHousehold(@Param("householdId") householdId: string) { ... }
 */
@Injectable()
export class HouseholdRoleGuard implements CanActivate {
  private readonly logger = new Logger(HouseholdRoleGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<HouseholdRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no @Roles() decorator, allow any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: UserWithRelations; params: Record<string, string>; query: Record<string, string> }>();

    const user = request.user;
    const householdId = request.params["householdId"] ?? request.query["householdId"];

    if (!householdId) {
      this.logger.warn("HouseholdRoleGuard: no householdId in request");
      throw new ForbiddenException("Household context required");
    }

    const membership = user.householdMemberships.find((m) => m.householdId === householdId);

    if (!membership) {
      throw new ForbiddenException("You are not a member of this household");
    }

    if (!requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Requires one of: ${requiredRoles.join(", ")} — you are ${membership.role}`,
      );
    }

    return true;
  }
}
