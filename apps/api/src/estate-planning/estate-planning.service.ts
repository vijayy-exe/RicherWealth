import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { HouseholdAccessService } from "../household/household-access.service";
import { AuditService } from "../audit/audit.service";
import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import {
  TRANSFER_CHECKLIST_STEP_TEMPLATE,
  type CreateBeneficiaryDto,
  type UpdateBeneficiaryDto,
  type ToggleChecklistStepDto,
  type EstateBeneficiaryDto,
  type AssetTransferChecklistDto,
  type TransferChecklistStep,
  type MissingNomineeAssetDto,
} from "@richer/shared-types";

/**
 * Phase 21: estate beneficiary/trust records, the asset-transfer checklist
 * workflow, and the missing-nominee checklist. Deliberately does NOT import
 * AssetsModule — view/edit checks are done directly against Prisma +
 * HouseholdAccessService (the same rules AssetsService itself uses), the
 * same "each module owns its own access checks" independence Tax/Vault
 * already follow rather than reaching into each other's services.
 */
@Injectable()
export class EstatePlanningService {
  private readonly logger = new Logger(EstatePlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseholdAccessService,
    private readonly audit: AuditService,
  ) {}

  private async assetOrThrow(assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.deletedAt) throw new NotFoundException("Asset not found.");
    return asset;
  }

  private async assertView(userId: string, assetId: string) {
    const asset = await this.assetOrThrow(assetId);
    if (asset.userId === userId) return asset;
    if (asset.householdId) {
      const householdIds = await this.access.householdIdsFor(userId);
      if (householdIds.includes(asset.householdId)) return asset;
    }
    throw new NotFoundException("Asset not found.");
  }

  private async assertEdit(userId: string, assetId: string) {
    const asset = await this.assetOrThrow(assetId);
    await this.access.assertCanEditResource(userId, asset.userId, asset.householdId);
    return asset;
  }

  // ─── Beneficiaries / trust records ─────────────────────────────────────────

  async listBeneficiaries(userId: string, assetId: string): Promise<EstateBeneficiaryDto[]> {
    await this.assertView(userId, assetId);
    const rows = await this.prisma.estateBeneficiary.findMany({ where: { assetId }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => this.toBeneficiaryDto(r));
  }

  async addBeneficiary(userId: string, assetId: string, dto: CreateBeneficiaryDto): Promise<EstateBeneficiaryDto> {
    await this.assertEdit(userId, assetId);
    await this.assertAllocationFits(assetId, dto.allocationPercent, null);

    const row = await this.prisma.estateBeneficiary.create({
      data: {
        assetId,
        beneficiaryName: dto.beneficiaryName,
        relationship: dto.relationship,
        allocationPercent: dto.allocationPercent.toString(),
        trustName: dto.trustName ?? null,
        notes: dto.notes ?? null,
      },
    });

    await this.audit.log({
      actorId: userId, action: "ESTATE_BENEFICIARY_ADDED", resourceType: "EstateBeneficiary", resourceId: row.id,
      metadata: { assetId, beneficiaryName: dto.beneficiaryName, allocationPercent: dto.allocationPercent },
    });
    return this.toBeneficiaryDto(row);
  }

  async updateBeneficiary(
    userId: string,
    assetId: string,
    beneficiaryId: string,
    dto: UpdateBeneficiaryDto,
  ): Promise<EstateBeneficiaryDto> {
    await this.assertEdit(userId, assetId);
    const existing = await this.prisma.estateBeneficiary.findFirst({ where: { id: beneficiaryId, assetId } });
    if (!existing) throw new NotFoundException("Beneficiary record not found.");

    if (dto.allocationPercent !== undefined) {
      await this.assertAllocationFits(assetId, dto.allocationPercent, beneficiaryId);
    }

    const row = await this.prisma.estateBeneficiary.update({
      where: { id: beneficiaryId },
      data: {
        ...(dto.beneficiaryName !== undefined && { beneficiaryName: dto.beneficiaryName }),
        ...(dto.relationship !== undefined && { relationship: dto.relationship }),
        ...(dto.allocationPercent !== undefined && { allocationPercent: dto.allocationPercent.toString() }),
        ...(dto.trustName !== undefined && { trustName: dto.trustName ?? null }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
      },
    });

    await this.audit.log({
      actorId: userId, action: "ESTATE_BENEFICIARY_UPDATED", resourceType: "EstateBeneficiary", resourceId: row.id, metadata: { assetId },
    });
    return this.toBeneficiaryDto(row);
  }

  async removeBeneficiary(userId: string, assetId: string, beneficiaryId: string): Promise<{ deleted: true }> {
    await this.assertEdit(userId, assetId);
    const existing = await this.prisma.estateBeneficiary.findFirst({ where: { id: beneficiaryId, assetId } });
    if (!existing) throw new NotFoundException("Beneficiary record not found.");

    await this.prisma.estateBeneficiary.delete({ where: { id: beneficiaryId } });
    await this.audit.log({
      actorId: userId, action: "ESTATE_BENEFICIARY_REMOVED", resourceType: "EstateBeneficiary", resourceId: beneficiaryId, metadata: { assetId },
    });
    return { deleted: true };
  }

  /** Every asset's beneficiaries' allocationPercent must sum to <= 100. */
  private async assertAllocationFits(assetId: string, incomingPercent: number, excludeId: string | null): Promise<void> {
    const existing = await this.prisma.estateBeneficiary.findMany({
      where: { assetId, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { allocationPercent: true },
    });
    const existingTotal = existing.reduce((sum, r) => sum.add(new Decimal(r.allocationPercent.toString())), new Decimal(0));
    const total = existingTotal.add(incomingPercent);
    if (total.gt(100)) {
      throw new BadRequestException(
        `Beneficiary allocations for this asset would total ${total.toFixed(2)}% — must not exceed 100%.`,
      );
    }
  }

  // ─── Asset-transfer checklist ───────────────────────────────────────────────

  async getOrCreateTransferChecklist(userId: string, assetId: string): Promise<AssetTransferChecklistDto> {
    await this.assertView(userId, assetId);

    const existing = await this.prisma.assetTransferChecklist.findUnique({ where: { assetId } });
    if (existing) return this.toChecklistDto(existing);

    const seeded: TransferChecklistStep[] = TRANSFER_CHECKLIST_STEP_TEMPLATE.map((step) => ({
      ...step, completed: false, completedAt: null, note: null,
    }));
    const created = await this.prisma.assetTransferChecklist.create({
      data: { assetId, steps: seeded as unknown as Prisma.InputJsonValue },
    });
    return this.toChecklistDto(created);
  }

  async toggleChecklistStep(userId: string, assetId: string, dto: ToggleChecklistStepDto): Promise<AssetTransferChecklistDto> {
    await this.assertEdit(userId, assetId);
    const checklist = await this.getOrCreateTransferChecklist(userId, assetId);

    const steps = checklist.steps.map((s): TransferChecklistStep =>
      s.id === dto.stepId
        ? { ...s, completed: dto.completed, completedAt: dto.completed ? new Date().toISOString() : null, note: dto.note ?? s.note }
        : s,
    );
    if (!steps.some((s) => s.id === dto.stepId)) throw new NotFoundException(`Unknown checklist step: ${dto.stepId}`);

    const updated = await this.prisma.assetTransferChecklist.update({
      where: { assetId },
      data: { steps: steps as unknown as Prisma.InputJsonValue },
    });

    await this.audit.log({
      actorId: userId, action: "ESTATE_TRANSFER_CHECKLIST_UPDATED", resourceType: "AssetTransferChecklist", resourceId: updated.id,
      metadata: { assetId, stepId: dto.stepId, completed: dto.completed },
    });
    return this.toChecklistDto(updated);
  }

  // ─── Missing-nominee checklist (estate-planning landing page) ──────────────

  async getMissingNomineeChecklist(userId: string): Promise<MissingNomineeAssetDto[]> {
    const householdIds = await this.access.householdIdsFor(userId);
    const assets = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        nomineeName: null,
        OR: [
          { userId, householdId: null },
          ...(householdIds.length > 0 ? [{ householdId: { in: householdIds } }] : []),
        ],
      },
      include: { user: { select: { name: true } } },
      orderBy: { currentValue: "desc" },
    });

    return assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      currentValue: new Decimal(a.currentValue.toString()).toNumber(),
      currencyCode: a.currencyCode,
      ownerUserId: a.userId,
      ownerName: a.user.name,
      isJoint: a.householdId !== null,
    }));
  }

  private toBeneficiaryDto(row: {
    id: string; assetId: string; beneficiaryName: string; relationship: string;
    allocationPercent: Decimal | string; trustName: string | null; notes: string | null; createdAt: Date;
  }): EstateBeneficiaryDto {
    return {
      id: row.id,
      assetId: row.assetId,
      beneficiaryName: row.beneficiaryName,
      relationship: row.relationship,
      allocationPercent: new Decimal(row.allocationPercent.toString()).toNumber(),
      trustName: row.trustName,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toChecklistDto(row: { id: string; assetId: string; steps: unknown; updatedAt: Date }): AssetTransferChecklistDto {
    return {
      id: row.id,
      assetId: row.assetId,
      steps: row.steps as TransferChecklistStep[],
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
