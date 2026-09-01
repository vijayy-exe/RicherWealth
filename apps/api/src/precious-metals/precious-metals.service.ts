import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import { PreciousMetalPriceSyncService } from "./precious-metal-price-sync.service";
import type { PreciousMetalType, PreciousMetalSubType } from "@prisma/client";
import Decimal from "decimal.js";

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  currency: string;
  count: number;
}

export interface CreatePreciousMetalDto {
  metalType: "GOLD" | "SILVER";
  subType: "PHYSICAL" | "DIGITAL" | "ETF" | "JEWELLERY";
  name: string;
  /** Grams — required for PHYSICAL/JEWELLERY. */
  weightGrams?: number;
  /** 0-1 fraction, e.g. 0.9167 for 22K gold, 0.999 for fine silver — required for PHYSICAL/JEWELLERY. */
  purityFraction?: number;
  /** Units held — required for DIGITAL/ETF, treated as gram-equivalents. */
  quantity?: number;
  avgBuyPrice: number;
  makingCharge?: number;
  currency: string;
  purchaseDate?: string;
}

export interface PreciousMetalAnalytics {
  spotPricePerGram: number | null;
  currency: string;
  marketValue: number;
  costBasis: number;
  totalGainAbs: number;
  totalGainPct: number;
  isStale: boolean;
  provider: string | null;
}

export interface PreciousMetalRow {
  id: string; // Asset ID
  holdingId: string;
  metalType: PreciousMetalType;
  subType: PreciousMetalSubType;
  name: string;
  weightGrams: number | null;
  purityFraction: number | null;
  quantity: number | null;
  avgBuyPrice: number;
  makingCharge: number | null;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: PreciousMetalAnalytics;
}

/** Effective grams of pure metal this holding represents, for valuation. */
function effectiveGrams(subType: PreciousMetalSubType, weightGrams: number | null, purityFraction: number | null, quantity: number | null): number {
  if (subType === "PHYSICAL" || subType === "JEWELLERY") {
    return (weightGrams ?? 0) * (purityFraction ?? 1);
  }
  return quantity ?? 0;
}

@Injectable()
export class PreciousMetalsService {
  private readonly logger = new Logger(PreciousMetalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly priceSync: PreciousMetalPriceSyncService,
    private readonly currency: CurrencyService,
  ) {}

  async getPortfolioSummary(userId: string): Promise<PortfolioSummary | null> {
    const [holdings, user] = await Promise.all([
      this.prisma.preciousMetalHolding.findMany({ where: { userId, asset: { deletedAt: null } } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    if (holdings.length === 0) return null;

    let totalValue = new Decimal(0);
    let totalCost = new Decimal(0);

    for (const h of holdings) {
      const grams = effectiveGrams(
        h.subType,
        h.weightGrams ? parseFloat(h.weightGrams.toString()) : null,
        h.purityFraction ? parseFloat(h.purityFraction.toString()) : null,
        h.quantity ? parseFloat(h.quantity.toString()) : null,
      );
      const costBasis = new Decimal(grams).mul(h.avgBuyPrice.toString()).add(h.makingCharge?.toString() ?? 0);
      const live = await this.priceSync.getPrice(h.metalType);
      const spotInHoldingCurrency = live
        ? await this.currency.convert(new Decimal(live.pricePerGramUsd), "USD", h.currency)
        : null;
      const marketValue = spotInHoldingCurrency
        ? new Decimal(grams).mul(spotInHoldingCurrency).add(h.subType === "JEWELLERY" ? (h.makingCharge?.toString() ?? 0) : 0)
        : costBasis;

      totalValue = totalValue.add(await this.currency.convert(marketValue, h.currency, user.baseCurrency));
      totalCost = totalCost.add(await this.currency.convert(costBasis, h.currency, user.baseCurrency));
    }

    return { totalValue: totalValue.toNumber(), totalCost: totalCost.toNumber(), currency: user.baseCurrency, count: holdings.length };
  }

  async createHolding(userId: string, dto: CreatePreciousMetalDto): Promise<PreciousMetalRow> {
    const grams = effectiveGrams(dto.subType, dto.weightGrams ?? null, dto.purityFraction ?? null, dto.quantity ?? null);
    const live = await this.priceSync.getPrice(dto.metalType);
    const spotInCurrency = live ? await this.currency.convert(new Decimal(live.pricePerGramUsd), "USD", dto.currency) : null;
    const currentValue = spotInCurrency
      ? new Decimal(grams).mul(spotInCurrency).add(dto.subType === "JEWELLERY" ? (dto.makingCharge ?? 0) : 0)
      : new Decimal(grams).mul(dto.avgBuyPrice).add(dto.makingCharge ?? 0);

    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: dto.metalType,
          name: dto.name,
          currentValue: currentValue.toFixed(6),
          currencyCode: dto.currency,
          details: { subType: dto.subType, weightGrams: dto.weightGrams, purityFraction: dto.purityFraction, quantity: dto.quantity },
        },
      });

      await tx.preciousMetalHolding.create({
        data: {
          assetId: asset.id,
          userId,
          metalType: dto.metalType as PreciousMetalType,
          subType: dto.subType as PreciousMetalSubType,
          weightGrams: dto.weightGrams?.toString() ?? null,
          purityFraction: dto.purityFraction?.toString() ?? null,
          quantity: dto.quantity?.toString() ?? null,
          avgBuyPrice: dto.avgBuyPrice.toString(),
          makingCharge: dto.makingCharge?.toString() ?? null,
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

  async listHoldings(userId: string): Promise<PreciousMetalRow[]> {
    const holdings = await this.prisma.preciousMetalHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(holdings.map((h) => this.buildRow(h.assetId)));
  }

  async deleteHolding(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
    if (!asset) throw new NotFoundException("Precious metal holding not found");

    await this.prisma.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
    await this.netWorth.writeSnapshot(userId);
  }

  /** Refreshes currentValue on every live Asset row for a metal — called by the scheduler. */
  async syncHoldingValues(metal: "GOLD" | "SILVER", pricePerGramUsd: number): Promise<void> {
    const holdings = await this.prisma.preciousMetalHolding.findMany({
      where: { metalType: metal as PreciousMetalType, asset: { deletedAt: null } },
    });

    for (const h of holdings) {
      const grams = effectiveGrams(
        h.subType,
        h.weightGrams ? parseFloat(h.weightGrams.toString()) : null,
        h.purityFraction ? parseFloat(h.purityFraction.toString()) : null,
        h.quantity ? parseFloat(h.quantity.toString()) : null,
      );
      const spotInCurrency = await this.currency.convert(new Decimal(pricePerGramUsd), "USD", h.currency);
      const newValue = new Decimal(grams).mul(spotInCurrency).add(h.subType === "JEWELLERY" ? (h.makingCharge?.toString() ?? 0) : 0);
      await this.prisma.asset.update({ where: { id: h.assetId }, data: { currentValue: newValue.toFixed(6) } });
      await this.prisma.preciousMetalHolding.update({ where: { id: h.id }, data: { lastSyncAt: new Date() } });
    }

    const userIds = [...new Set(holdings.map((h) => h.userId))];
    for (const uid of userIds) await this.netWorth.writeSnapshot(uid);
  }

  private async buildRow(assetId: string): Promise<PreciousMetalRow> {
    const holding = await this.prisma.preciousMetalHolding.findUnique({ where: { assetId } });
    if (!holding) throw new NotFoundException("Precious metal holding not found");

    const weightGrams = holding.weightGrams ? parseFloat(holding.weightGrams.toString()) : null;
    const purityFraction = holding.purityFraction ? parseFloat(holding.purityFraction.toString()) : null;
    const quantity = holding.quantity ? parseFloat(holding.quantity.toString()) : null;
    const avgBuyPrice = parseFloat(holding.avgBuyPrice.toString());
    const makingCharge = holding.makingCharge ? parseFloat(holding.makingCharge.toString()) : null;
    const grams = effectiveGrams(holding.subType, weightGrams, purityFraction, quantity);
    const costBasis = grams * avgBuyPrice + (makingCharge ?? 0);

    let analytics: PreciousMetalAnalytics;
    try {
      const live = await this.priceSync.getPrice(holding.metalType);
      if (live) {
        const spotInCurrency = (await this.currency.convert(new Decimal(live.pricePerGramUsd), "USD", holding.currency)).toNumber();
        const marketValue = grams * spotInCurrency + (holding.subType === "JEWELLERY" ? (makingCharge ?? 0) : 0);
        const totalGainAbs = marketValue - costBasis;
        analytics = {
          spotPricePerGram: spotInCurrency,
          currency: holding.currency,
          marketValue,
          costBasis,
          totalGainAbs,
          totalGainPct: costBasis > 0 ? (totalGainAbs / costBasis) * 100 : 0,
          isStale: live.isStale,
          provider: live.provider,
        };
      } else {
        analytics = { spotPricePerGram: null, currency: holding.currency, marketValue: costBasis, costBasis, totalGainAbs: 0, totalGainPct: 0, isStale: true, provider: null };
      }
    } catch {
      analytics = { spotPricePerGram: null, currency: holding.currency, marketValue: costBasis, costBasis, totalGainAbs: 0, totalGainPct: 0, isStale: true, provider: null };
    }

    return {
      id: holding.assetId,
      holdingId: holding.id,
      metalType: holding.metalType,
      subType: holding.subType,
      name: (await this.prisma.asset.findUniqueOrThrow({ where: { id: holding.assetId }, select: { name: true } })).name,
      weightGrams,
      purityFraction,
      quantity,
      avgBuyPrice,
      makingCharge,
      currency: holding.currency,
      purchaseDate: holding.purchaseDate?.toISOString().slice(0, 10) ?? null,
      lastSyncAt: holding.lastSyncAt?.toISOString() ?? null,
      analytics,
    };
  }
}
