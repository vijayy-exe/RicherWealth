import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { HouseholdRole } from "@prisma/client";

/**
 * Phase 21 RBAC. Single place every household/estate-planning/asset access
 * check goes through, so the rule set is defined exactly once:
 *
 *  - VIEW: any member of a household the target also belongs to (any role,
 *    including VIEWER) may view that member's individual assets and the
 *    household aggregate. This is the point of a "viewer" role (e.g. an
 *    accountant with read-only access to the whole family's finances).
 *  - EDIT: an asset's own creator (userId) can always edit it. A
 *    household-owned asset (householdId set) can be edited by any
 *    OWNER/MEMBER of that household — never a VIEWER. Nobody edits another
 *    specific member's PRIVATE asset, regardless of role — this is the
 *    literal acceptance criterion ("VIEWER cannot edit another member's
 *    private assets") generalized to a safe default for every role. A
 *    future "delegate" permission (e.g. a guardian managing a minor's
 *    assets) is explicitly out of scope here — see STATUS.md.
 *  - Membership management (add/remove/change role) is OWNER-only, enforced
 *    by the existing HouseholdRoleGuard + @Roles("OWNER") — this service
 *    doesn't duplicate that check.
 */
@Injectable()
export class HouseholdAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** All household ids the given user currently belongs to. */
  async householdIdsFor(userId: string): Promise<string[]> {
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId },
      select: { householdId: true },
    });
    return memberships.map((m) => m.householdId);
  }

  private async membershipsFor(userId: string): Promise<Array<{ householdId: string; role: HouseholdRole }>> {
    return this.prisma.householdMember.findMany({
      where: { userId },
      select: { householdId: true, role: true },
    });
  }

  /** True if actorId and targetUserId share at least one household. */
  async shareHousehold(actorId: string, targetUserId: string): Promise<boolean> {
    if (actorId === targetUserId) return true;
    const [actorHouseholds, targetHouseholds] = await Promise.all([
      this.householdIdsFor(actorId),
      this.householdIdsFor(targetUserId),
    ]);
    return actorHouseholds.some((id) => targetHouseholds.includes(id));
  }

  /** Throws if actorId may not VIEW targetUserId's individual data. */
  async assertCanView(actorId: string, targetUserId: string): Promise<void> {
    if (await this.shareHousehold(actorId, targetUserId)) return;
    throw new ForbiddenException("You do not share a household with this member.");
  }

  /**
   * Throws unless actorId may EDIT the given asset/liability, given its
   * owning userId and (nullable) householdId.
   */
  async assertCanEditResource(
    actorId: string,
    resourceOwnerId: string,
    resourceHouseholdId: string | null,
  ): Promise<void> {
    if (actorId === resourceOwnerId && !resourceHouseholdId) return; // own private resource

    if (resourceHouseholdId) {
      const memberships = await this.membershipsFor(actorId);
      const membership = memberships.find((m) => m.householdId === resourceHouseholdId);
      if (membership && membership.role !== "VIEWER") return; // OWNER/MEMBER may edit joint resources
      throw new ForbiddenException(
        membership
          ? "VIEWER role cannot edit household assets."
          : "You are not a member of the household that owns this asset.",
      );
    }

    throw new ForbiddenException("You cannot edit another member's private asset.");
  }

  /** Throws unless actorId is an OWNER of the given household. */
  async assertIsOwner(actorId: string, householdId: string): Promise<void> {
    const membership = await this.prisma.householdMember.findUnique({
      where: { userId_householdId: { userId: actorId, householdId } },
    });
    if (!membership || membership.role !== "OWNER") {
      throw new ForbiddenException("Only a household OWNER may perform this action.");
    }
  }
}
