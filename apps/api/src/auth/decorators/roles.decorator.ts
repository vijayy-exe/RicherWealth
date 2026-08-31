import { SetMetadata } from "@nestjs/common";

import type { HouseholdRole } from "@prisma/client";

export const ROLES_KEY = "roles";

/**
 * @Roles(...roles) decorator — declares which HouseholdRoles may access a route.
 * Enforced by HouseholdRoleGuard.
 *
 * Usage:
 *   @Roles("OWNER", "MEMBER")
 *   async updateHousehold(...) { ... }
 */
export const Roles = (...roles: HouseholdRole[]) => SetMetadata(ROLES_KEY, roles);
