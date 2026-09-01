import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import type { BondType } from "@prisma/client";
import Decimal from "decimal.js";

export interface PortfolioSummary {
  totalValue: number;
  annualIncome: number;
  currency: string;
  count: number;
}

export interface CreateBondHoldingDto {
  issuer: string;
  bondType: "GOVT" | "CORPORATE" | "MUNICIPAL" | "SGB";
  faceValue: number;
  couponRate: number;        // annual % e.g. 7.25
  maturityDate: string;      // ISO date string
  quantityHeld: number;
  purchaseDate?: string;
  purchasePrice?: number;    // price paid per bond
  isin?: string;
  currencyCode?: string;
}

export interface BondAnalytics {
  currentValue: number;             // quantityHeld × faceValue (book value)
  annualCouponIncome: number;       // quantityHeld × faceValue × couponRate / 100
  daysToMaturity: number;
  isMatured: boolean;
  ytm: number | null;               // stubbed null in Phase 5
  totalCostBasis: number | null;    // quantityHeld × purchasePrice
}

export interface BondHoldingRow {
  id: string;           // Asset ID
  holdingId: string;    // BondHolding ID
  issuer: string;
  bondType: "GOVT" | "CORPORATE" | "MUNICIPAL" | "SGB";
  faceValue: number;
  couponRate: number;
  maturityDate: string;  // YYYY-MM-DD
  quantityHeld: number;
  purchaseDate: string | null;
  purchasePrice: number | null;
  isin: string | null;
  currencyCode: string;
  analytics: BondAnalytics;
}

@Injectable()
export class BondsService {
  private readonly logger = new Logger(BondsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly currency: CurrencyService,
  ) {}

  /** Currency-correct portfolio summary — see mutual-funds.service.ts's PortfolioSummary doc comment for why. */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary | null> {
    const [holdings, user] = await Promise.all([
      this.prisma.bondHolding.findMany({ where: { userId, asset: { deletedAt: null } }, include: { asset: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    if (holdings.length === 0) return null;

    let totalValue = new Decimal(0);
    let annualIncome = new Decimal(0);

    for (const h of holdings) {
      const faceValue = new Decimal(h.faceValue.toString());
      const currentValue = faceValue.mul(h.quantityHeld);
      const income = currentValue.mul(h.couponRate.toString()).div(100);

      totalValue = totalValue.add(await this.currency.convert(currentValue, h.asset.currencyCode, user.baseCurrency));
      annualIncome = annualIncome.add(await this.currency.convert(income, h.asset.currencyCode, user.baseCurrency));
    }

    return { totalValue: totalValue.toNumber(), annualIncome: annualIncome.toNumber(), currency: user.baseCurrency, count: holdings.length };
  }

  // ─── Holdings CRUD ─────────────────────────────────────────────────────────

  async createHolding(userId: string, dto: CreateBondHoldingDto): Promise<BondHoldingRow> {
    // currentValue = quantityHeld × faceValue (book/par value)
    const currentValue = new Decimal(dto.quantityHeld).mul(dto.faceValue);

    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: "BOND",
          name: `${dto.issuer} Bond (${dto.bondType})`,
          currentValue: currentValue.toFixed(6),
          currencyCode: dto.currencyCode ?? "INR",
          details: {
            issuer: dto.issuer,
            bondType: dto.bondType,
            faceValue: dto.faceValue,
            couponRate: dto.couponRate,
            maturityDate: dto.maturityDate,
            quantityHeld: dto.quantityHeld,
          },
        },
      });

      await tx.bondHolding.create({
        data: {
          assetId: asset.id,
          userId,
          issuer: dto.issuer,
          bondType: dto.bondType as BondType,
          faceValue: dto.faceValue.toString(),
          couponRate: dto.couponRate.toString(),
          maturityDate: new Date(dto.maturityDate),
          quantityHeld: dto.quantityHeld,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          purchasePrice: dto.purchasePrice?.toString() ?? null,
          isin: dto.isin ?? null,
        },
      });

      return [asset];
    });

    await this.netWorth.writeSnapshot(userId);
    return this.buildHoldingRow(asset.id);
  }

  async listHoldings(userId: string): Promise<BondHoldingRow[]> {
    const holdings = await this.prisma.bondHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      orderBy: { maturityDate: "asc" },
    });

    return Promise.all(holdings.map((h) => this.buildHoldingRow(h.assetId)));
  }

  async deleteHolding(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException("Bond holding not found");

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });

    await this.netWorth.writeSnapshot(userId);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async buildHoldingRow(assetId: string): Promise<BondHoldingRow> {
    const holding = await this.prisma.bondHolding.findUnique({
      where: { assetId },
      include: { asset: true },
    });
    if (!holding) throw new NotFoundException("Bond holding not found");

    const faceValue = parseFloat(holding.faceValue.toString());
    const couponRate = parseFloat(holding.couponRate.toString());
    const quantityHeld = holding.quantityHeld;
    const currentValue = quantityHeld * faceValue;

    // Annual coupon income
    const annualCouponIncome = (currentValue * couponRate) / 100;

    // Days to maturity
    const now = new Date();
    const maturity = new Date(holding.maturityDate);
    const daysToMaturity = Math.max(
      0,
      Math.floor((maturity.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const isMatured = daysToMaturity === 0;

    const purchasePrice = holding.purchasePrice
      ? parseFloat(holding.purchasePrice.toString())
      : null;

    const totalCostBasis = purchasePrice ? purchasePrice * quantityHeld : null;

    return {
      id: holding.assetId,
      holdingId: holding.id,
      issuer: holding.issuer,
      bondType: holding.bondType as "GOVT" | "CORPORATE" | "MUNICIPAL" | "SGB",
      faceValue,
      couponRate,
      maturityDate: holding.maturityDate.toISOString().slice(0, 10),
      quantityHeld,
      purchaseDate: holding.purchaseDate ? holding.purchaseDate.toISOString().slice(0, 10) : null,
      purchasePrice,
      isin: holding.isin,
      currencyCode: holding.asset.currencyCode,
      analytics: {
        currentValue,
        annualCouponIncome,
        daysToMaturity,
        isMatured,
        ytm: null, // Phase 6: requires market price data
        totalCostBasis,
      },
    };
  }
}
