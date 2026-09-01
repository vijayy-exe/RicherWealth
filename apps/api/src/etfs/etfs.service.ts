import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { PriceSyncService } from "../stocks/price-sync.service";
import { AnalyticsService, type HoldingAnalytics } from "../stocks/analytics.service";
import Decimal from "decimal.js";

export interface CreateEtfHoldingDto {
  ticker: string;
  exchange: string;
  unitsHeld: number;
  avgBuyPrice: number;
  currency: string;
  name?: string;
  purchaseDate?: string;
}

export interface EtfHoldingRow {
  id: string;          // Asset ID
  holdingId: string;   // EtfHolding ID
  name: string;
  ticker: string;
  exchange: string;
  unitsHeld: number;
  avgBuyPrice: number;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: HoldingAnalytics | null;
  priceError: boolean;
}

@Injectable()
export class EtfsService {
  private readonly logger = new Logger(EtfsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceSync: PriceSyncService,
    private readonly analytics: AnalyticsService,
    private readonly netWorth: NetWorthService,
  ) {}

  // ─── Holdings CRUD ─────────────────────────────────────────────────────────

  async createHolding(userId: string, dto: CreateEtfHoldingDto): Promise<EtfHoldingRow> {
    const ticker = dto.ticker.toUpperCase();
    const exchange = dto.exchange.toUpperCase();

    // Fetch live price (validates ticker; ETFs trade like stocks on same exchanges)
    const liveData = await this.priceSync.refreshPrice(ticker, exchange);
    const livePrice = liveData?.price ?? dto.avgBuyPrice;
    const assetName = dto.name ?? `${ticker} ETF (${exchange})`;

    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: "ETF",
          name: assetName,
          currentValue: (livePrice * dto.unitsHeld).toString(),
          currencyCode: dto.currency,
          details: { ticker, exchange, unitsHeld: dto.unitsHeld, avgBuyPrice: dto.avgBuyPrice },
        },
      });

      await tx.etfHolding.create({
        data: {
          assetId: asset.id,
          userId,
          ticker,
          exchange,
          unitsHeld: dto.unitsHeld.toString(),
          avgBuyPrice: dto.avgBuyPrice.toString(),
          currency: dto.currency,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          lastSyncAt: liveData ? new Date() : null,
        },
      });

      return [asset];
    });

    await this.netWorth.writeSnapshot(userId);
    return this.buildHoldingRow(asset.id);
  }

  async listHoldings(userId: string): Promise<EtfHoldingRow[]> {
    const holdings = await this.prisma.etfHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
    });

    return Promise.all(holdings.map((h) => this.buildHoldingRow(h.assetId)));
  }

  async deleteHolding(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException("ETF holding not found");

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });

    await this.netWorth.writeSnapshot(userId);
  }

  /** Called by PriceSyncScheduler after price refresh — same pattern as stocks */
  async syncHoldingValues(ticker: string, exchange: string, livePrice: number): Promise<void> {
    const holdings = await this.prisma.etfHolding.findMany({
      where: { ticker, exchange, asset: { deletedAt: null } },
    });

    for (const h of holdings) {
      const newValue = new Decimal(livePrice).mul(new Decimal(h.unitsHeld.toString()));
      await this.prisma.asset.update({
        where: { id: h.assetId },
        data: { currentValue: newValue.toFixed(6) },
      });
      await this.prisma.etfHolding.update({
        where: { id: h.id },
        data: { lastSyncAt: new Date() },
      });
    }

    const userIds = [...new Set(holdings.map((h) => h.userId))];
    for (const uid of userIds) {
      await this.netWorth.writeSnapshot(uid);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async buildHoldingRow(assetId: string): Promise<EtfHoldingRow> {
    const holding = await this.prisma.etfHolding.findUnique({
      where: { assetId },
      include: { asset: true },
    });
    if (!holding) throw new NotFoundException("ETF holding not found");

    let analytics: HoldingAnalytics | null = null;
    let priceError = false;

    try {
      const liveData = await this.priceSync.getPrice(holding.ticker, holding.exchange);
      if (liveData) {
        analytics = this.analytics.computeHoldingStats(
          parseFloat(holding.unitsHeld.toString()),
          parseFloat(holding.avgBuyPrice.toString()),
          holding.purchaseDate,
          liveData,
        );
      } else {
        priceError = true;
      }
    } catch {
      priceError = true;
    }

    return {
      id: holding.assetId,
      holdingId: holding.id,
      name: holding.asset.name,
      ticker: holding.ticker,
      exchange: holding.exchange,
      unitsHeld: parseFloat(holding.unitsHeld.toString()),
      avgBuyPrice: parseFloat(holding.avgBuyPrice.toString()),
      currency: holding.currency,
      purchaseDate: holding.purchaseDate?.toISOString() ?? null,
      lastSyncAt: holding.lastSyncAt?.toISOString() ?? null,
      analytics,
      priceError,
    };
  }
}
