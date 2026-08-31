import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { PriceSyncService } from "./price-sync.service";
import { AnalyticsService, type HoldingAnalytics } from "./analytics.service";
import { EventEmitter2 } from "@nestjs/event-emitter";
import Decimal from "decimal.js";

export interface CreateHoldingDto {
  ticker: string;
  exchange: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  name?: string;
  purchaseDate?: string; // ISO date string
}

export interface HoldingRow {
  id: string;          // Asset ID
  holdingId: string;   // StockHolding ID
  name: string;
  ticker: string;
  exchange: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: HoldingAnalytics | null;
  priceError: boolean;
}

export interface WatchlistWithItems {
  id: string;
  name: string;
  items: WatchlistItemRow[];
}

export interface WatchlistItemRow {
  id: string;
  ticker: string;
  exchange: string;
  livePrice: number | null;
  dayChangePct: number | null;
  isStale: boolean;
}

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceSync: PriceSyncService,
    private readonly analytics: AnalyticsService,
    private readonly netWorth: NetWorthService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Holdings ─────────────────────────────────────────────────────────────

  async addHolding(userId: string, dto: CreateHoldingDto): Promise<HoldingRow> {
    const ticker = dto.ticker.toUpperCase();
    const exchange = dto.exchange.toUpperCase();

    // Fetch live price before creating (validates ticker)
    const liveData = await this.priceSync.refreshPrice(ticker, exchange);

    const livePrice = liveData?.price ?? dto.avgBuyPrice;
    const assetName = dto.name ?? `${ticker} (${exchange})`;

    // Create Asset + StockHolding in transaction
    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: "STOCK",
          name: assetName,
          currentValue: (livePrice * dto.quantity).toString(),
          currencyCode: dto.currency,
          details: { ticker, exchange, quantity: dto.quantity, avgBuyPrice: dto.avgBuyPrice },
        },
      });

      await tx.stockHolding.create({
        data: {
          assetId: asset.id,
          userId,
          ticker,
          exchange,
          quantity: dto.quantity.toString(),
          avgBuyPrice: dto.avgBuyPrice.toString(),
          currency: dto.currency,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          lastSyncAt: liveData ? new Date() : null,
        },
      });

      return [asset];
    });

    // Update net worth
    await this.netWorth.writeSnapshot(userId);

    return this.buildHoldingRow(asset.id, userId);
  }

  async listHoldings(userId: string): Promise<HoldingRow[]> {
    const holdings = await this.prisma.stockHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      include: { asset: true },
      orderBy: { createdAt: "asc" },
    });

    return Promise.all(holdings.map((h) => this.buildHoldingRow(h.assetId, userId)));
  }

  async deleteHolding(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException("Holding not found");

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });

    await this.netWorth.writeSnapshot(userId);
  }

  /**
   * Update Asset.currentValue with live price × quantity.
   * Called by PriceSyncScheduler after each price refresh.
   */
  async syncHoldingValues(ticker: string, exchange: string, livePrice: number): Promise<void> {
    const holdings = await this.prisma.stockHolding.findMany({
      where: { ticker, exchange, asset: { deletedAt: null } },
      include: { asset: true },
    });

    for (const h of holdings) {
      const newValue = new Decimal(livePrice).mul(new Decimal(h.quantity.toString()));
      await this.prisma.asset.update({
        where: { id: h.assetId },
        data: { currentValue: newValue.toFixed(6) },
      });
      await this.prisma.stockHolding.update({
        where: { id: h.id },
        data: { lastSyncAt: new Date() },
      });
    }

    // Emit event per affected user for WebSocket push
    const userIds = [...new Set(holdings.map((h) => h.userId))];
    for (const uid of userIds) {
      this.events.emit("stock-price.updated", { userId: uid, ticker, exchange, livePrice });
      await this.netWorth.writeSnapshot(uid);
    }
  }

  // ─── Watchlists ────────────────────────────────────────────────────────────

  async listWatchlists(userId: string): Promise<WatchlistWithItems[]> {
    const watchlists = await this.prisma.watchlist.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    return Promise.all(
      watchlists.map(async (wl) => ({
        id: wl.id,
        name: wl.name,
        items: await Promise.all(
          wl.items.map(async (item) => {
            const price = await this.priceSync.getPrice(item.ticker, item.exchange);
            let dayChangePct: number | null = null;
            if (price?.previousClose && price.previousClose > 0) {
              dayChangePct = ((price.price - price.previousClose) / price.previousClose) * 100;
            }
            return {
              id: item.id,
              ticker: item.ticker,
              exchange: item.exchange,
              livePrice: price?.price ?? null,
              dayChangePct,
              isStale: price?.isStale ?? true,
            };
          }),
        ),
      })),
    );
  }

  async createWatchlist(userId: string, name: string): Promise<{ id: string; name: string }> {
    const wl = await this.prisma.watchlist.create({ data: { userId, name } });
    return { id: wl.id, name: wl.name };
  }

  async addToWatchlist(watchlistId: string, userId: string, ticker: string, exchange: string): Promise<void> {
    await this.prisma.watchlistItem.create({
      data: { watchlistId, ticker: ticker.toUpperCase(), exchange: exchange.toUpperCase() },
    });
  }

  async removeFromWatchlist(itemId: string): Promise<void> {
    await this.prisma.watchlistItem.delete({ where: { id: itemId } });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async buildHoldingRow(assetId: string, userId: string): Promise<HoldingRow> {
    const holding = await this.prisma.stockHolding.findUnique({
      where: { assetId },
      include: { asset: true },
    });

    if (!holding) throw new NotFoundException("Holding not found");

    let analytics: HoldingAnalytics | null = null;
    let priceError = false;

    try {
      const liveData = await this.priceSync.getPrice(holding.ticker, holding.exchange);
      if (liveData) {
        analytics = this.analytics.computeHoldingStats(
          parseFloat(holding.quantity.toString()),
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
      quantity: parseFloat(holding.quantity.toString()),
      avgBuyPrice: parseFloat(holding.avgBuyPrice.toString()),
      currency: holding.currency,
      purchaseDate: holding.purchaseDate?.toISOString() ?? null,
      lastSyncAt: holding.lastSyncAt?.toISOString() ?? null,
      analytics,
      priceError,
    };
  }
}
