import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import { CommodityPriceSyncService, type CommodityCode } from "./commodity-price-sync.service";
import type { CommodityType } from "@prisma/client";
import Decimal from "decimal.js";

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  currency: string;
  count: number;
}

export interface CreateCommodityDto {
  commodityType: CommodityCode;
  name: string;
  quantity: number;
  unit: string;
  avgBuyPrice: number;
  currency: string;
  purchaseDate?: string;
}

export interface CommodityAnalytics {
  livePrice: number | null;
  currency: string;
  marketValue: number;
  costBasis: number;
  totalGainAbs: number;
  totalGainPct: number;
  isStale: boolean;
  provider: string | null;
}

export interface CommodityRow {
  id: string; // Asset ID
  holdingId: string;
  commodityType: CommodityType;
  name: string;
  quantity: number;
  unit: string;
  avgBuyPrice: number;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: CommodityAnalytics;
}

@Injectable()
export class CommoditiesService {
  private readonly logger = new Logger(CommoditiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly priceSync: CommodityPriceSyncService,
    private readonly currency: CurrencyService,
  ) {}

  async getPortfolioSummary(userId: string): Promise<PortfolioSummary | null> {
    const [holdings, user] = await Promise.all([
      this.prisma.commodityHolding.findMany({ where: { userId, asset: { deletedAt: null } } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    if (holdings.length === 0) return null;

    let totalValue = new Decimal(0);
    let totalCost = new Decimal(0);

    for (const h of holdings) {
      const quantity = new Decimal(h.quantity.toString());
      const costBasis = quantity.mul(h.avgBuyPrice.toString());
      const live = await this.priceSync.getPrice(h.commodityType as CommodityCode);
      const marketValueUsd = live ? quantity.mul(live.price) : null;
      const marketValue = marketValueUsd ? await this.currency.convert(marketValueUsd, "USD", h.currency) : costBasis;

      totalValue = totalValue.add(await this.currency.convert(marketValue, h.currency, user.baseCurrency));
      totalCost = totalCost.add(await this.currency.convert(costBasis, h.currency, user.baseCurrency));
    }

    return { totalValue: totalValue.toNumber(), totalCost: totalCost.toNumber(), currency: user.baseCurrency, count: holdings.length };
  }

  async createHolding(userId: string, dto: CreateCommodityDto): Promise<CommodityRow> {
    const live = await this.priceSync.getPrice(dto.commodityType);
    const currentValue = live
      ? (await this.currency.convert(new Decimal(dto.quantity).mul(live.price), "USD", dto.currency))
      : new Decimal(dto.quantity).mul(dto.avgBuyPrice);

    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: "COMMODITY",
          name: dto.name,
          currentValue: currentValue.toFixed(6),
          currencyCode: dto.currency,
          details: { commodityType: dto.commodityType, quantity: dto.quantity, unit: dto.unit },
        },
      });

      await tx.commodityHolding.create({
        data: {
          assetId: asset.id,
          userId,
          commodityType: dto.commodityType as CommodityType,
          quantity: dto.quantity.toString(),
          unit: dto.unit,
          avgBuyPrice: dto.avgBuyPrice.toString(),
          currency: dto.currency,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          lastSyncAt: live ? new Date() : null,
        },
      });

      return [asset];
    });

    await this.netWorth.writeSnapshot(userId);
    return this.buildRow(asset.id);
  }

  async listHoldings(userId: string): Promise<CommodityRow[]> {
    const holdings = await this.prisma.commodityHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(holdings.map((h) => this.buildRow(h.assetId)));
  }

  async deleteHolding(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
    if (!asset) throw new NotFoundException("Commodity holding not found");

    await this.prisma.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
    await this.netWorth.writeSnapshot(userId);
  }

  /** Called by the price-sync scheduler after each refresh. */
  async syncHoldingValues(commodityType: CommodityCode, priceUsd: number): Promise<void> {
    const holdings = await this.prisma.commodityHolding.findMany({
      where: { commodityType: commodityType as CommodityType, asset: { deletedAt: null } },
    });

    for (const h of holdings) {
      const marketValueUsd = new Decimal(priceUsd).mul(h.quantity.toString());
      const newValue = await this.currency.convert(marketValueUsd, "USD", h.currency);
      await this.prisma.asset.update({ where: { id: h.assetId }, data: { currentValue: newValue.toFixed(6) } });
      await this.prisma.commodityHolding.update({ where: { id: h.id }, data: { lastSyncAt: new Date() } });
    }

    const userIds = [...new Set(holdings.map((h) => h.userId))];
    for (const uid of userIds) await this.netWorth.writeSnapshot(uid);
  }

  private async buildRow(assetId: string): Promise<CommodityRow> {
    const holding = await this.prisma.commodityHolding.findUnique({ where: { assetId } });
    if (!holding) throw new NotFoundException("Commodity holding not found");

    const quantity = parseFloat(holding.quantity.toString());
    const avgBuyPrice = parseFloat(holding.avgBuyPrice.toString());
    const costBasis = quantity * avgBuyPrice;

    let analytics: CommodityAnalytics;
    try {
      const live = await this.priceSync.getPrice(holding.commodityType as CommodityCode);
      if (live) {
        const marketValue = (await this.currency.convert(new Decimal(quantity).mul(live.price), "USD", holding.currency)).toNumber();
        const totalGainAbs = marketValue - costBasis;
        analytics = {
          livePrice: live.price,
          currency: holding.currency,
          marketValue,
          costBasis,
          totalGainAbs,
          totalGainPct: costBasis > 0 ? (totalGainAbs / costBasis) * 100 : 0,
          isStale: live.isStale,
          provider: live.provider,
        };
      } else {
        analytics = { livePrice: null, currency: holding.currency, marketValue: costBasis, costBasis, totalGainAbs: 0, totalGainPct: 0, isStale: true, provider: null };
      }
    } catch {
      analytics = { livePrice: null, currency: holding.currency, marketValue: costBasis, costBasis, totalGainAbs: 0, totalGainPct: 0, isStale: true, provider: null };
    }

    return {
      id: holding.assetId,
      holdingId: holding.id,
      commodityType: holding.commodityType,
      name: (await this.prisma.asset.findUniqueOrThrow({ where: { id: holding.assetId }, select: { name: true } })).name,
      quantity,
      unit: holding.unit,
      avgBuyPrice,
      currency: holding.currency,
      purchaseDate: holding.purchaseDate?.toISOString().slice(0, 10) ?? null,
      lastSyncAt: holding.lastSyncAt?.toISOString() ?? null,
      analytics,
    };
  }
}
