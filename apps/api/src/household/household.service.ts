import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService, type NetWorthResult } from "../net-worth/net-worth.service";
import { HouseholdAccessService } from "./household-access.service";
import type {
  CreateHouseholdDto,
  AddHouseholdMemberDto,
  UpdateHouseholdMemberRoleDto,
  HouseholdDto,
  HouseholdNetWorthDto,
} from "@richer/shared-types";

/**
 * Phase 21: household CRUD + membership + net-worth views. Finally gives
 * the Phase 1 `Household`/`HouseholdMember`/`HouseholdRoleGuard` scaffold
 * (previously wired to zero real routes — see PROJECT_CONTEXT.md) a real
 * home. Membership add/remove/role-change is OWNER-only, enforced by the
 * existing HouseholdRoleGuard + @Roles("OWNER") on the controller, not
 * duplicated here.
 */
@Injectable()
export class HouseholdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly access: HouseholdAccessService,
  ) {}

  async create(userId: string, dto: CreateHouseholdDto): Promise<HouseholdDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } });
    const household = await this.prisma.household.create({
      data: {
        name: dto.name,
        baseCurrency: user.baseCurrency,
        members: { create: { userId, role: "OWNER" } },
      },
      include: { members: { include: { user: true } } },
    });
    return this.toDto(household);
  }

  async listMine(userId: string): Promise<HouseholdDto[]> {
    const households = await this.prisma.household.findMany({
      where: { members: { some: { userId } } },
      include: { members: { include: { user: true } } },
    });
    return households.map((h) => this.toDto(h));
  }

  async findOneOrThrow(householdId: string) {
    const household = await this.prisma.household.findUnique({
      where: { id: householdId },
      include: { members: { include: { user: true } } },
    });
    if (!household) throw new NotFoundException("Household not found.");
    return household;
  }

  async getOne(userId: string, householdId: string): Promise<HouseholdDto> {
    const household = await this.findOneOrThrow(householdId);
    const isMember = household.members.some((m) => m.userId === userId);
    if (!isMember) throw new NotFoundException("Household not found.");
    return this.toDto(household);
  }

  async addMember(actorId: string, householdId: string, dto: AddHouseholdMemberDto): Promise<HouseholdDto> {
    const target = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!target) throw new NotFoundException("No RicherWealth user found with that email.");

    const existing = await this.prisma.householdMember.findUnique({
      where: { userId_householdId: { userId: target.id, householdId } },
    });
    if (existing) throw new ConflictException("This user is already a member of the household.");

    await this.prisma.householdMember.create({
      data: { userId: target.id, householdId, role: dto.role },
    });
    return this.getOne(actorId, householdId);
  }

  async updateMemberRole(
    actorId: string,
    householdId: string,
    targetUserId: string,
    dto: UpdateHouseholdMemberRoleDto,
  ): Promise<HouseholdDto> {
    await this.prisma.householdMember.update({
      where: { userId_householdId: { userId: targetUserId, householdId } },
      data: { role: dto.role },
    });
    return this.getOne(actorId, householdId);
  }

  async removeMember(actorId: string, householdId: string, targetUserId: string): Promise<HouseholdDto> {
    await this.prisma.householdMember.delete({
      where: { userId_householdId: { userId: targetUserId, householdId } },
    });
    return this.getOne(actorId, householdId);
  }

  async getHouseholdNetWorth(userId: string, householdId: string): Promise<HouseholdNetWorthDto> {
    const household = await this.findOneOrThrow(householdId);
    const isMember = household.members.some((m) => m.userId === userId);
    if (!isMember) throw new NotFoundException("Household not found.");

    const result = await this.netWorth.calculateHouseholdNetWorth(householdId);
    return this.toNetWorthDto(householdId, result, household.members.length);
  }

  async getMemberNetWorth(actorId: string, householdId: string, targetUserId: string): Promise<HouseholdNetWorthDto> {
    const household = await this.findOneOrThrow(householdId);
    const memberIds = household.members.map((m) => m.userId);
    if (!memberIds.includes(actorId)) throw new NotFoundException("Household not found.");
    if (!memberIds.includes(targetUserId)) throw new NotFoundException("That user is not a member of this household.");
    await this.access.assertCanView(actorId, targetUserId);

    const result = await this.netWorth.calculateNetWorth(targetUserId);
    return this.toNetWorthDto(householdId, result, 1);
  }

  private toNetWorthDto(householdId: string, result: NetWorthResult, memberCount: number): HouseholdNetWorthDto {
    return {
      householdId,
      totalAssets: result.totalAssets.toNumber(),
      totalLiabilities: result.totalLiabilities.toNumber(),
      netWorth: result.netWorth.toNumber(),
      baseCurrency: result.baseCurrency,
      memberCount,
    };
  }

  private toDto(household: {
    id: string;
    name: string;
    baseCurrency: string;
    createdAt: Date;
    members: Array<{ userId: string; role: string; joinedAt: Date; user: { name: string | null; email: string } }>;
  }): HouseholdDto {
    return {
      id: household.id,
      name: household.name,
      baseCurrency: household.baseCurrency,
      createdAt: household.createdAt.toISOString(),
      members: household.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role as HouseholdDto["members"][number]["role"],
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }
}
