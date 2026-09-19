import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import { HouseholdAccessService } from "../household/household-access.service";
import { AuditService } from "../audit/audit.service";
import type { CreateAssetDto, UpdateAssetDto } from "./dto/asset.dto";
import type { Asset, Prisma } from "@prisma/client";
import Decimal from "decimal.js";

export interface AssetsPortfolioSummary {
  totalValue: number;
  currency: string;
  count: number;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly events: EventEmitter2,
    private readonly currency: CurrencyService,
    private readonly householdAccess: HouseholdAccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Currency-correct total across all manually-entered assets. The
   * (app)/assets page previously summed `currentValue` directly regardless
   * of `currencyCode` — silently wrong for a user with assets in more than
   * one currency. This is the same bug/fix as mutual-funds/bonds/crypto's
   * getPortfolioSummary — see mutual-funds.service.ts's doc comment.
   */
  async getPortfolioSummary(userId: string, type?: string): Promise<AssetsPortfolioSummary | null> {
    const [assets, user] = await Promise.all([
      this.prisma.asset.findMany({
        where: { userId, deletedAt: null, ...(type ? { type: type as Asset["type"] } : {}) },
        select: { currentValue: true, currencyCode: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    if (assets.length === 0) return null;

    let totalValue = new Decimal(0);
    for (const a of assets) {
      totalValue = totalValue.add(await this.currency.convert(new Decimal(a.currentValue.toString()), a.currencyCode, user.baseCurrency));
    }
    return { totalValue: totalValue.toNumber(), currency: user.baseCurrency, count: assets.length };
  }

  /** Includes joint (household-owned) assets from any household this user belongs to — see NetWorthService.calculateNetWorth's identical rule. */
  async findAll(userId: string, type?: string): Promise<Asset[]> {
    const householdIds = await this.householdAccess.householdIdsFor(userId);
    return this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId, householdId: null },
          ...(householdIds.length > 0 ? [{ householdId: { in: householdIds } }] : []),
        ],
        ...(type ? { type: type as Asset["type"] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** VIEW check: creator, or a member of the household that jointly owns this asset. */
  async findOne(userId: string, id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException("Asset not found");
    if (asset.userId === userId) return asset;
    if (asset.householdId) {
      const householdIds = await this.householdAccess.householdIdsFor(userId);
      if (householdIds.includes(asset.householdId)) return asset;
    }
    throw new ForbiddenException("Access denied");
  }

  /** EDIT check (stricter than findOne — see HouseholdAccessService's rule set doc comment). */
  private async findEditable(userId: string, id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException("Asset not found");
    await this.householdAccess.assertCanEditResource(userId, asset.userId, asset.householdId);
    return asset;
  }

  async create(userId: string, dto: CreateAssetDto): Promise<Asset> {
    if (dto.householdId) {
      // Marking an asset joint at creation requires a non-VIEWER role in that household.
      await this.householdAccess.assertCanEditResource(userId, userId, dto.householdId);
    }

    const asset = await this.prisma.asset.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type as Asset["type"],
        currentValue: dto.currentValue.toString(),
        currencyCode: dto.currencyCode,
        notes: dto.notes ?? null,
        details: (dto.details ?? {}) as Prisma.InputJsonValue,
        householdId: dto.householdId ?? null,
        nomineeName: dto.nomineeName ?? null,
        nomineeRelationship: dto.nomineeRelationship ?? null,
        nomineeContact: dto.nomineeContact ?? null,
      },
    });

    this.logger.log(`Asset created: ${asset.id} (${asset.type}) for user ${userId}`);
    await this.triggerNetWorthUpdate(userId);
    return asset;
  }

  async update(userId: string, id: string, dto: UpdateAssetDto): Promise<Asset> {
    const existing = await this.findEditable(userId, id);

    // Changing the household assignment (joining/leaving joint ownership) is
    // an estate-shaping decision — only the asset's own creator may do it,
    // and only into a household they're a non-VIEWER member of.
    if (dto.householdId !== undefined && dto.householdId !== existing.householdId) {
      if (existing.userId !== userId) {
        throw new ForbiddenException("Only the asset's creator can change its household assignment.");
      }
      if (dto.householdId) {
        await this.householdAccess.assertCanEditResource(userId, userId, dto.householdId);
      }
    }

    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type as Asset["type"] }),
        ...(dto.currentValue !== undefined && { currentValue: dto.currentValue.toString() }),
        ...(dto.currencyCode !== undefined && { currencyCode: dto.currencyCode }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.details !== undefined && { details: dto.details as Prisma.InputJsonValue }),
        ...(dto.householdId !== undefined && { householdId: dto.householdId }),
        ...(dto.nomineeName !== undefined && { nomineeName: dto.nomineeName }),
        ...(dto.nomineeRelationship !== undefined && { nomineeRelationship: dto.nomineeRelationship }),
        ...(dto.nomineeContact !== undefined && { nomineeContact: dto.nomineeContact }),
      },
    });

    const nomineeOrHouseholdChanged =
      dto.nomineeName !== undefined || dto.nomineeRelationship !== undefined ||
      dto.nomineeContact !== undefined || dto.householdId !== undefined;
    if (nomineeOrHouseholdChanged) {
      await this.audit.log({
        actorId: userId,
        action: "ASSET_ESTATE_FIELDS_UPDATED",
        resourceType: "Asset",
        resourceId: id,
        metadata: {
          nomineeName: dto.nomineeName, nomineeRelationship: dto.nomineeRelationship,
          nomineeContact: dto.nomineeContact, householdId: dto.householdId,
        },
      });
    }

    await this.triggerNetWorthUpdate(userId);
    return asset;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findEditable(userId, id);

    // Soft-delete — never hard-delete financial records
    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Asset soft-deleted: ${id}`);
    await this.triggerNetWorthUpdate(userId);
  }

  // ─── Manual revaluation history (collectibles, NFTs, etc.) ────────────────

  /** Appends a revaluation entry and updates the asset's currentValue to
   * match — this is how a user without a pricing API tracks value changes
   * over time while still keeping net worth correct. */
  async addRevaluation(
    userId: string,
    assetId: string,
    dto: { value: number; currency: string; note?: string; valuedAt?: string },
  ) {
    await this.findEditable(userId, assetId);

    const [entry] = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.assetRevaluation.create({
        data: {
          assetId,
          userId,
          value: dto.value.toString(),
          currency: dto.currency,
          note: dto.note ?? null,
          ...(dto.valuedAt && { valuedAt: new Date(dto.valuedAt) }),
        },
      });
      await tx.asset.update({
        where: { id: assetId },
        data: { currentValue: dto.value.toFixed(6), currencyCode: dto.currency },
      });
      return [entry];
    });

    await this.triggerNetWorthUpdate(userId);
    return {
      id: entry.id,
      assetId: entry.assetId,
      value: parseFloat(entry.value.toString()),
      currency: entry.currency,
      note: entry.note,
      valuedAt: entry.valuedAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
    };
  }

  async listRevaluations(userId: string, assetId: string) {
    await this.findOne(userId, assetId); // view check — creator or household co-owner

    // Filtered by assetId alone (not assetId+userId): a joint asset's
    // revaluation history belongs to the asset, and a co-owner viewing it
    // didn't necessarily write every entry themselves.
    const entries = await this.prisma.assetRevaluation.findMany({
      where: { assetId },
      orderBy: { valuedAt: "desc" },
    });
    return entries.map((e) => ({
      id: e.id,
      assetId: e.assetId,
      value: parseFloat(e.value.toString()),
      currency: e.currency,
      note: e.note,
      valuedAt: e.valuedAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
    }));
  }

  private async triggerNetWorthUpdate(userId: string): Promise<void> {
    try {
      await this.netWorth.writeSnapshot(userId);
    } catch (err) {
      this.logger.error(`Failed to update net worth snapshot for ${userId}`, err);
    }
  }
}
