import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
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

  async findAll(userId: string, type?: string): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(type ? { type: type as Asset["type"] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(userId: string, id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException("Asset not found");
    if (asset.userId !== userId) throw new ForbiddenException("Access denied");
    return asset;
  }

  async create(userId: string, dto: CreateAssetDto): Promise<Asset> {
    const asset = await this.prisma.asset.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type as Asset["type"],
        currentValue: dto.currentValue.toString(),
        currencyCode: dto.currencyCode,
        notes: dto.notes ?? null,
        details: (dto.details ?? {}) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Asset created: ${asset.id} (${asset.type}) for user ${userId}`);
    await this.triggerNetWorthUpdate(userId);
    return asset;
  }

  async update(userId: string, id: string, dto: UpdateAssetDto): Promise<Asset> {
    await this.findOne(userId, id); // ownership check

    const asset = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type as Asset["type"] }),
        ...(dto.currentValue !== undefined && { currentValue: dto.currentValue.toString() }),
        ...(dto.currencyCode !== undefined && { currencyCode: dto.currencyCode }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.details !== undefined && { details: dto.details as Prisma.InputJsonValue }),
      },
    });

    await this.triggerNetWorthUpdate(userId);
    return asset;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id); // ownership check

    // Soft-delete — never hard-delete financial records
    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Asset soft-deleted: ${id}`);
    await this.triggerNetWorthUpdate(userId);
  }

  private async triggerNetWorthUpdate(userId: string): Promise<void> {
    try {
      await this.netWorth.writeSnapshot(userId);
    } catch (err) {
      this.logger.error(`Failed to update net worth snapshot for ${userId}`, err);
    }
  }
}
