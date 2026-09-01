import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import { XirrService, type CashFlow } from "./xirr.service";
import Decimal from "decimal.js";

export interface PortfolioSummary {
  totalValue: number;
  totalInvested: number;
  currency: string;
  count: number;
}

export interface CreateMfHoldingDto {
  schemeCode: string;
  fundName: string;
  investmentType: "SIP" | "LUMPSUM";
  unitsHeld: number;
  avgNAV: number;
  expenseRatio?: number;
  isin?: string;
  currencyCode?: string;
}

export interface AddSipInstallmentDto {
  amount: number;
  units: number;
  nav: number;
  date: string; // ISO date string YYYY-MM-DD
}

export interface MfHoldingAnalytics {
  currentValue: number;
  totalInvested: number;
  absoluteReturn: number;
  absoluteReturnPct: number;
  xirr: number | null;    // annualised return as decimal e.g. 0.089
  cagr: number | null;    // annualised return as decimal
  latestNAV: number | null;
  navDate: string | null;
  sipCount: number;
  expenseRatioImpact: number | null;
}

export interface MfHoldingRow {
  id: string;           // Asset ID
  holdingId: string;    // MutualFundHolding ID
  schemeCode: string;
  fundName: string;
  investmentType: "SIP" | "LUMPSUM";
  unitsHeld: number;
  avgNAV: number;
  expenseRatio: number | null;
  isin: string | null;
  lastNavSyncAt: string | null;
  currencyCode: string;
  analytics: MfHoldingAnalytics;
  sipInstallments: SipInstallmentRow[];
}

export interface SipInstallmentRow {
  id: string;
  amount: number;
  units: number;
  nav: number;
  date: string;
}

export interface NavPoint {
  date: string;  // YYYY-MM-DD
  nav: number;
}

@Injectable()
export class MutualFundsService {
  private readonly logger = new Logger(MutualFundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly xirr: XirrService,
    private readonly currency: CurrencyService,
  ) {}

  /**
   * Portfolio-level summary, correctly currency-converted. Fixes a real bug:
   * the frontend previously summed each holding's raw currentValue directly
   * regardless of currencyCode, which silently produces nonsense if a user
   * holds funds in more than one currency (e.g. one INR fund + one USD fund
   * summed as if both were the same unit). Every value is converted to the
   * user's baseCurrency here — this is the "money-aggregating service"
   * CurrencyService is meant for, same principle net-worth.service.ts
   * already follows.
   */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary | null> {
    const [holdings, user] = await Promise.all([
      this.prisma.mutualFundHolding.findMany({
        where: { userId, asset: { deletedAt: null } },
        include: { asset: true, sipInstallments: true },
      }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } }),
    ]);
    if (holdings.length === 0) return null;

    let totalValue = new Decimal(0);
    let totalInvested = new Decimal(0);

    for (const h of holdings) {
      const unitsHeld = new Decimal(h.unitsHeld.toString());
      const latestNavRecord = await this.prisma.navHistory.findFirst({
        where: { schemeCode: h.schemeCode },
        orderBy: { date: "desc" },
      });
      const latestNAV = latestNavRecord ? new Decimal(latestNavRecord.nav.toString()) : new Decimal(h.avgNAV.toString());
      const currentValue = unitsHeld.mul(latestNAV);

      const invested = h.sipInstallments.length > 0
        ? h.sipInstallments.reduce((s, si) => s.add(si.amount.toString()), new Decimal(0))
        : unitsHeld.mul(h.avgNAV.toString());

      totalValue = totalValue.add(await this.currency.convert(currentValue, h.asset.currencyCode, user.baseCurrency));
      totalInvested = totalInvested.add(await this.currency.convert(invested, h.asset.currencyCode, user.baseCurrency));
    }

    return {
      totalValue: totalValue.toNumber(),
      totalInvested: totalInvested.toNumber(),
      currency: user.baseCurrency,
      count: holdings.length,
    };
  }

  // ─── Holdings CRUD ─────────────────────────────────────────────────────────

  async createHolding(userId: string, dto: CreateMfHoldingDto): Promise<MfHoldingRow> {
    const currentValue = new Decimal(dto.unitsHeld).mul(dto.avgNAV);

    const [asset] = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          userId,
          type: "MUTUAL_FUND",
          name: dto.fundName,
          currentValue: currentValue.toFixed(6),
          currencyCode: dto.currencyCode ?? "INR",
          details: {
            schemeCode: dto.schemeCode,
            investmentType: dto.investmentType,
            unitsHeld: dto.unitsHeld,
            avgNAV: dto.avgNAV,
          },
        },
      });

      await tx.mutualFundHolding.create({
        data: {
          assetId: asset.id,
          userId,
          schemeCode: dto.schemeCode,
          fundName: dto.fundName,
          investmentType: dto.investmentType,
          unitsHeld: dto.unitsHeld.toString(),
          avgNAV: dto.avgNAV.toString(),
          expenseRatio: dto.expenseRatio?.toString() ?? null,
          isin: dto.isin ?? null,
        },
      });

      return [asset];
    });

    await this.netWorth.writeSnapshot(userId);
    return this.buildHoldingRow(asset.id, userId);
  }

  async listHoldings(userId: string): Promise<MfHoldingRow[]> {
    const holdings = await this.prisma.mutualFundHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
    });

    return Promise.all(holdings.map((h) => this.buildHoldingRow(h.assetId, userId)));
  }

  async deleteHolding(userId: string, assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId, deletedAt: null },
    });
    if (!asset) throw new NotFoundException("Mutual fund holding not found");

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });

    await this.netWorth.writeSnapshot(userId);
  }

  // ─── SIP Installments ──────────────────────────────────────────────────────

  async addSipInstallment(
    userId: string,
    assetId: string,
    dto: AddSipInstallmentDto,
  ): Promise<SipInstallmentRow> {
    const holding = await this.prisma.mutualFundHolding.findFirst({
      where: { assetId, userId },
    });
    if (!holding) throw new NotFoundException("Mutual fund holding not found");

    // Recalculate weighted average NAV and total units
    const newTotalUnits = new Decimal(holding.unitsHeld.toString()).add(dto.units);
    const newTotalCost = new Decimal(holding.unitsHeld.toString())
      .mul(holding.avgNAV.toString())
      .add(new Decimal(dto.units).mul(dto.nav));
    const newAvgNAV = newTotalCost.div(newTotalUnits);

    const [installment] = await this.prisma.$transaction(async (tx) => {
      const installment = await tx.sipInstallment.create({
        data: {
          mutualFundHoldingId: holding.id,
          amount: dto.amount.toString(),
          units: dto.units.toString(),
          nav: dto.nav.toString(),
          date: new Date(dto.date),
        },
      });

      // Update holding with new units + weighted avg NAV
      await tx.mutualFundHolding.update({
        where: { id: holding.id },
        data: {
          unitsHeld: newTotalUnits.toFixed(8),
          avgNAV: newAvgNAV.toFixed(6),
        },
      });

      // Sync Asset.currentValue
      const latestNav = dto.nav; // use this SIP's NAV as a proxy until sync job runs
      await tx.asset.update({
        where: { id: assetId },
        data: { currentValue: newTotalUnits.mul(latestNav).toFixed(6) },
      });

      return [installment];
    });

    await this.netWorth.writeSnapshot(userId);

    return {
      id: installment.id,
      amount: parseFloat(installment.amount.toString()),
      units: parseFloat(installment.units.toString()),
      nav: parseFloat(installment.nav.toString()),
      date: new Date(installment.date).toISOString().slice(0, 10),
    };
  }

  // ─── NAV History ───────────────────────────────────────────────────────────

  async getNavHistory(schemeCode: string, days = 365): Promise<NavPoint[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const records = await this.prisma.navHistory.findMany({
      where: { schemeCode, date: { gte: since } },
      orderBy: { date: "asc" },
      select: { date: true, nav: true },
    });

    return records.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      nav: parseFloat(r.nav.toString()),
    }));
  }

  // ─── Update asset value after NAV sync ─────────────────────────────────────

  async syncHoldingValues(schemeCode: string, latestNAV: number): Promise<void> {
    const holdings = await this.prisma.mutualFundHolding.findMany({
      where: { schemeCode, asset: { deletedAt: null } },
    });

    for (const h of holdings) {
      const newValue = new Decimal(h.unitsHeld.toString()).mul(latestNAV);
      await this.prisma.asset.update({
        where: { id: h.assetId },
        data: { currentValue: newValue.toFixed(6) },
      });
      await this.prisma.mutualFundHolding.update({
        where: { id: h.id },
        data: { lastNavSyncAt: new Date() },
      });
    }

    const userIds = [...new Set(holdings.map((h) => h.userId))];
    for (const uid of userIds) {
      await this.netWorth.writeSnapshot(uid);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async buildHoldingRow(assetId: string, userId: string): Promise<MfHoldingRow> {
    const holding = await this.prisma.mutualFundHolding.findUnique({
      where: { assetId },
      include: {
        asset: true,
        sipInstallments: { orderBy: { date: "asc" } },
      },
    });
    if (!holding) throw new NotFoundException("Mutual fund holding not found");

    // Latest NAV from NavHistory
    const latestNavRecord = await this.prisma.navHistory.findFirst({
      where: { schemeCode: holding.schemeCode },
      orderBy: { date: "desc" },
    });

    const latestNAV = latestNavRecord
      ? parseFloat(latestNavRecord.nav.toString())
      : parseFloat(holding.avgNAV.toString());

    const navDate = latestNavRecord
      ? latestNavRecord.date.toISOString().slice(0, 10)
      : null;

    const unitsHeld = parseFloat(holding.unitsHeld.toString());
    const avgNAV = parseFloat(holding.avgNAV.toString());
    const currentValue = unitsHeld * latestNAV;

    // Total invested: sum of SIP installments or unitsHeld × avgNAV for lumpsum
    const sipInstallments = holding.sipInstallments;
    const totalInvested =
      sipInstallments.length > 0
        ? sipInstallments.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0)
        : unitsHeld * avgNAV;

    const absoluteReturn = currentValue - totalInvested;
    const absoluteReturnPct = totalInvested > 0 ? (absoluteReturn / totalInvested) * 100 : 0;

    // XIRR: build cash flows from SIP installments (or the single lumpsum
    // outflow) + current redemption value. computeXirr handles a plain
    // 2-cash-flow lumpsum case fine (it's equivalent to CAGR there), so this
    // isn't gated to SIP-only — every holding should get an XIRR.
    const cashFlows: CashFlow[] =
      sipInstallments.length > 0
        ? sipInstallments.map((s) => ({
            amount: -parseFloat(s.amount.toString()), // outflow
            date: new Date(s.date),
          }))
        : [{ amount: -totalInvested, date: holding.createdAt }];
    cashFlows.push({ amount: currentValue, date: new Date() }); // inflow (current value)
    const xirrValue = this.xirr.computeXirr(cashFlows);

    // CAGR from first SIP / holding creation date
    const firstSip = sipInstallments.length > 0 ? sipInstallments[0] : null;
    const firstDate = firstSip ? new Date(firstSip.date) : holding.createdAt;
    let cagr: number | null = null;
    if (totalInvested > 0 && currentValue > 0) {
      const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
      const years = (Date.now() - firstDate.getTime()) / msPerYear;
      if (years >= 0.0833) {
        cagr = Math.pow(currentValue / totalInvested, 1 / years) - 1;
      }
    }

    // Expense ratio annual impact on currentValue
    const expenseRatio = holding.expenseRatio ? parseFloat(holding.expenseRatio.toString()) : null;
    const expenseRatioImpact = expenseRatio ? (currentValue * expenseRatio) / 100 : null;

    return {
      id: holding.assetId,
      holdingId: holding.id,
      schemeCode: holding.schemeCode,
      fundName: holding.fundName,
      investmentType: holding.investmentType as "SIP" | "LUMPSUM",
      unitsHeld,
      avgNAV,
      expenseRatio,
      isin: holding.isin,
      lastNavSyncAt: holding.lastNavSyncAt?.toISOString() ?? null,
      currencyCode: holding.asset.currencyCode,
      analytics: {
        currentValue,
        totalInvested,
        absoluteReturn,
        absoluteReturnPct,
        xirr: xirrValue,
        cagr,
        latestNAV,
        navDate,
        sipCount: sipInstallments.length,
        expenseRatioImpact,
      },
      sipInstallments: sipInstallments.map((s) => ({
        id: s.id,
        amount: parseFloat(s.amount.toString()),
        units: parseFloat(s.units.toString()),
        nav: parseFloat(s.nav.toString()),
        date: new Date(s.date).toISOString().slice(0, 10),
      })),
    };
  }
}
