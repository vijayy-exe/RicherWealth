import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import { CryptoPriceSyncService } from "./crypto-price-sync.service";
import type { PriceAlertDirection } from "@prisma/client";
import Decimal from "decimal.js";

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  currency: string;
  count: number;
}

export interface CreateCryptoHoldingDto {
  coinId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  walletAddress?: string;
  purchaseDate?: string;
}

export interface CreatePriceAlertDto {
  coinId: string;
  symbol: string;
  targetPrice: number;
  direction: "ABOVE" | "BELOW";
  currency?: string;
}

export interface CryptoHoldingAnalytics {
  livePrice: number | null;
  currency: string;
  change24hPct: number | null;
  marketValue: number;
  costBasis: number;
  totalGainAbs: number;
  totalGainPct: number;
  isStale: boolean;
  provider: string | null;
}

export interface CryptoHoldingRow {
  id: string;          // Asset ID
  holdingId: string;   // CryptoHolding ID
  coinId: string;
  symbol: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  currency: string;
  walletAddress: string | null;
  purchaseDate: string | null;
  lastSyncAt: string | null;
  analytics: CryptoHoldingAnalytics;
}

export interface PriceAlertRow {
  id: string;
  coinId: string;
  symbol: string;
  targetPrice: number;
  direction: "ABOVE" | "BELOW";
  currency: string;
  triggeredAt: string | null;
  createdAt: string;
}

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly priceSync: CryptoPriceSyncService,
    private readonly currency: CurrencyService,
  ) {}

  /** Currency-correct portfolio summary — see mutual-funds.service.ts's PortfolioSummary doc comment for why. */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary | null> {
    const [holdings, user] = await Promise.all([
      this.prisma.cryptoHolding.findMany({ where: { userId, asset: { deletedAt: null } }, include: { asset: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    if (holdings.length === 0) return null;

    let totalValue = new Decimal(0);
    let totalCost = new Decimal(0);

    for (const h of holdings) {
      const quantity = new Decimal(h.quantity.toString());
      const costBasis = quantity.mul(h.avgBuyPrice.toString());
      const live = await this.priceSync.getPrice(h.coinId, h.currency);
      const marketValue = live ? quantity.mul(live.price) : costBasis;

      totalValue = totalValue.add(await this.currency.convert(marketValue, h.currency, user.baseCurrency));
      totalCost = totalCost.add(await this.currency.convert(costBasis, h.currency, user.baseCurrency));
    }

    return { totalValue: totalValue.toNumber(), totalCost: totalCost.toNumber(), currency: user.baseCurrency, count: holdings.length };
  }

  // ─── Holdings CRUD ─────────────────────────────────────────────────────────

  async createHolding(userId: string, dto: CreateCryptoHoldingDto): Promise<CryptoHoldingRow> {
    // Fetch a live price up front so the asset isn't created with a stale/zero value.
    const live = await this.priceSync.getPrice(dto.coinId, dto.currency);
    const currentValue = new Decimal(dto.quantity).mul(live?.price ?? dto.avgBuyPrice);

    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: "CRYPTO",
          name: dto.name,
          currentValue: currentValue.toFixed(6),
          currencyCode: dto.currency,
          details: { coinId: dto.coinId, symbol: dto.symbol, quantity: dto.quantity, avgBuyPrice: dto.avgBuyPrice },
        },
      });

      await tx.cryptoHolding.create({
        data: {
          assetId: asset.id,
          userId,
          coinId: dto.coinId,
          symbol: dto.symbol.toUpperCase(),
          name: dto.name,
          quantity: dto.quantity.toString(),
          avgBuyPrice: dto.avgBuyPrice.toString(),
          currency: dto.currency,
          walletAddress: dto.walletAddress ?? null,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          lastSyncAt: live ? new Date() : null,
        },
      });

      return [asset];
    });

    await this.netWorth.writeSnapshot(userId);
    return this.buildHoldingRow(asset.id);
  }

  async listHoldings(userId: string): Promise<CryptoHoldingRow[]> {
    const holdings = await this.prisma.cryptoHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(holdings.map((h) => this.buildHoldingRow(h.assetId)));
  }

  async deleteHolding(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, userId, deletedAt: null } });
    if (!asset) throw new NotFoundException("Crypto holding not found");

    await this.prisma.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
    await this.netWorth.writeSnapshot(userId);
  }

  /** Called by the price-sync scheduler after each refresh — same pattern as stocks/ETFs. */
  async syncHoldingValues(coinId: string, currency: string, livePrice: number): Promise<void> {
    const holdings = await this.prisma.cryptoHolding.findMany({
      where: { coinId, currency, asset: { deletedAt: null } },
    });

    for (const h of holdings) {
      const newValue = new Decimal(livePrice).mul(new Decimal(h.quantity.toString()));
      await this.prisma.asset.update({ where: { id: h.assetId }, data: { currentValue: newValue.toFixed(6) } });
      await this.prisma.cryptoHolding.update({ where: { id: h.id }, data: { lastSyncAt: new Date() } });
    }

    const userIds = [...new Set(holdings.map((h) => h.userId))];
    for (const uid of userIds) {
      await this.netWorth.writeSnapshot(uid);
    }
  }

  // ─── Price Alerts (Phase 6: persist only — delivery is Phase 17) ───────────

  async createAlert(userId: string, dto: CreatePriceAlertDto): Promise<PriceAlertRow> {
    const alert = await this.prisma.cryptoPriceAlert.create({
      data: {
        userId,
        coinId: dto.coinId,
        symbol: dto.symbol.toUpperCase(),
        targetPrice: dto.targetPrice.toString(),
        direction: dto.direction as PriceAlertDirection,
        currency: dto.currency ?? "USD",
      },
    });
    return this.toAlertRow(alert);
  }

  async listAlerts(userId: string): Promise<PriceAlertRow[]> {
    const alerts = await this.prisma.cryptoPriceAlert.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return alerts.map((a) => this.toAlertRow(a));
  }

  async deleteAlert(userId: string, alertId: string): Promise<void> {
    const alert = await this.prisma.cryptoPriceAlert.findFirst({ where: { id: alertId, userId } });
    if (!alert) throw new NotFoundException("Price alert not found");
    await this.prisma.cryptoPriceAlert.delete({ where: { id: alertId } });
  }

  private toAlertRow(a: {
    id: string; coinId: string; symbol: string; targetPrice: unknown; direction: string;
    currency: string; triggeredAt: Date | null; createdAt: Date;
  }): PriceAlertRow {
    return {
      id: a.id,
      coinId: a.coinId,
      symbol: a.symbol,
      targetPrice: parseFloat(String(a.targetPrice)),
      direction: a.direction as "ABOVE" | "BELOW",
      currency: a.currency,
      triggeredAt: a.triggeredAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async buildHoldingRow(assetId: string): Promise<CryptoHoldingRow> {
    const holding = await this.prisma.cryptoHolding.findUnique({
      where: { assetId },
      include: { asset: true },
    });
    if (!holding) throw new NotFoundException("Crypto holding not found");

    const quantity = parseFloat(holding.quantity.toString());
    const avgBuyPrice = parseFloat(holding.avgBuyPrice.toString());
    const costBasis = quantity * avgBuyPrice;

    let analytics: CryptoHoldingAnalytics;
    try {
      const live = await this.priceSync.getPrice(holding.coinId, holding.currency);
      if (live) {
        const marketValue = quantity * live.price;
        const totalGainAbs = marketValue - costBasis;
        analytics = {
          livePrice: live.price,
          currency: live.currency,
          change24hPct: live.change24hPct,
          marketValue,
          costBasis,
          totalGainAbs,
          totalGainPct: costBasis > 0 ? (totalGainAbs / costBasis) * 100 : 0,
          isStale: live.isStale,
          provider: live.provider,
        };
      } else {
        analytics = {
          livePrice: null, currency: holding.currency, change24hPct: null,
          marketValue: costBasis, costBasis, totalGainAbs: 0, totalGainPct: 0,
          isStale: true, provider: null,
        };
      }
    } catch {
      analytics = {
        livePrice: null, currency: holding.currency, change24hPct: null,
        marketValue: costBasis, costBasis, totalGainAbs: 0, totalGainPct: 0,
        isStale: true, provider: null,
      };
    }

    return {
      id: holding.assetId,
      holdingId: holding.id,
      coinId: holding.coinId,
      symbol: holding.symbol,
      name: holding.name,
      quantity,
      avgBuyPrice,
      currency: holding.currency,
      walletAddress: holding.walletAddress,
      purchaseDate: holding.purchaseDate?.toISOString().slice(0, 10) ?? null,
      lastSyncAt: holding.lastSyncAt?.toISOString() ?? null,
      analytics,
    };
  }
}
