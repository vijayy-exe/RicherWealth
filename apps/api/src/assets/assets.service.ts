import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import type { CreateAssetDto, UpdateAssetDto } from "./dto/asset.dto";
import type { Asset, Prisma } from "@prisma/client";

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly events: EventEmitter2,
  ) {}

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
