import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TaxHoldingType, TaxLotStatus } from "@prisma/client";
import type { RecordLotDto } from "./dto/tax.dto";
import Decimal from "decimal.js";

@Injectable()
export class TaxLotService {
  private readonly logger = new Logger(TaxLotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Record a real buy event — creates a new TaxLot with isBackfillEstimate: false */
  async recordBuy(userId: string, dto: RecordLotDto) {
    const acquiredAt = new Date(dto.acquiredAt);
    if (isNaN(acquiredAt.getTime())) throw new BadRequestException("Invalid acquiredAt date");

    const lot = await this.prisma.taxLot.create({
      data: {
        userId,
        holdingType: dto.holdingType as TaxHoldingType,
        assetId: dto.assetId ?? null,
        ticker: dto.ticker,
        displayName: dto.displayName,
        quantity: new Decimal(dto.quantity).toFixed(10),
        remainingQuantity: new Decimal(dto.quantity).toFixed(10),
        costBasisPerUnit: new Decimal(dto.costBasisPerUnit).toFixed(6),
        costBasisCurrency: dto.costBasisCurrency,
        acquiredAt,
        isBackfillEstimate: false,
        status: "OPEN",
      },
    });
    this.logger.log(`TaxLot created: ${lot.id} (${lot.ticker} x${lot.quantity})`);
    return lot;
  }

  /**
   * Backfill from existing holdings — creates ONE synthetic lot per holding
   * where no lot exists yet (isBackfillEstimate: true). Safe to re-run (upsert-like).
   */
  async backfillFromExistingHoldings(userId: string): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    // Stocks
    const stocks = await this.prisma.stockHolding.findMany({
      where: { userId },
      include: { asset: true },
    });
    for (const s of stocks) {
      const existing = await this.prisma.taxLot.findFirst({
        where: { userId, assetId: s.assetId, isBackfillEstimate: true },
      });
      if (existing) { skipped++; continue; }
      await this.prisma.taxLot.create({
        data: {
          userId,
          holdingType: "STOCK",
          assetId: s.assetId,
          ticker: s.ticker,
          displayName: s.asset.name,
          quantity: s.quantity.toFixed(10),
          remainingQuantity: s.quantity.toFixed(10),
          costBasisPerUnit: s.avgBuyPrice.toFixed(6),
          costBasisCurrency: s.currency,
          acquiredAt: s.purchaseDate ?? s.createdAt,
          isBackfillEstimate: true,
          status: "OPEN",
        },
      });
      created++;
    }

    // Mutual funds
    const mfs = await this.prisma.mutualFundHolding.findMany({
      where: { userId },
      include: { asset: true },
    });
    for (const m of mfs) {
      const existing = await this.prisma.taxLot.findFirst({
        where: { userId, assetId: m.assetId, isBackfillEstimate: true },
      });
      if (existing) { skipped++; continue; }
      await this.prisma.taxLot.create({
        data: {
          userId,
          holdingType: "MUTUAL_FUND",
          assetId: m.assetId,
          ticker: m.schemeCode,
          displayName: m.fundName,
          quantity: m.unitsHeld.toFixed(10),
          remainingQuantity: m.unitsHeld.toFixed(10),
          costBasisPerUnit: m.avgNAV.toFixed(6),
          costBasisCurrency: "INR", // MFAPI prices are always in INR
          acquiredAt: m.createdAt,
          isBackfillEstimate: true,
          status: "OPEN",
        },
      });
      created++;
    }

    // Crypto
    const cryptos = await this.prisma.cryptoHolding.findMany({
      where: { userId },
      include: { asset: true },
    });
    for (const c of cryptos) {
      const existing = await this.prisma.taxLot.findFirst({
        where: { userId, assetId: c.assetId, isBackfillEstimate: true },
      });
      if (existing) { skipped++; continue; }
      await this.prisma.taxLot.create({
        data: {
          userId,
          holdingType: "CRYPTO",
          assetId: c.assetId,
          ticker: c.coinId,
          displayName: c.name,
          quantity: c.quantity.toFixed(10),
          remainingQuantity: c.quantity.toFixed(10),
          costBasisPerUnit: c.avgBuyPrice.toFixed(6),
          costBasisCurrency: c.currency,
          acquiredAt: c.purchaseDate ? new Date(c.purchaseDate) : c.createdAt,
          isBackfillEstimate: true,
          status: "OPEN",
        },
      });
      created++;
    }

    this.logger.log(`Backfill complete for user ${userId}: created=${created} skipped=${skipped}`);
    return { created, skipped };
  }

  async findOpenLots(userId: string) {
    return this.prisma.taxLot.findMany({
      where: { userId, status: { in: ["OPEN", "PARTIALLY_DISPOSED"] } },
      orderBy: { acquiredAt: "asc" },
      include: { disposals: true },
    });
  }

  async findLot(userId: string, lotId: string) {
    const lot = await this.prisma.taxLot.findUnique({ where: { id: lotId } });
    if (!lot) throw new NotFoundException("Tax lot not found");
    if (lot.userId !== userId) throw new NotFoundException("Tax lot not found");
    return lot;
  }
}
