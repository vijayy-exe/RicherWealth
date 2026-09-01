import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import Decimal from "decimal.js";

export interface NetWorthResult {
  totalAssets: Decimal;
  totalLiabilities: Decimal;
  netWorth: Decimal;
  baseCurrency: string;
  assetAllocation: AllocationItem[];
  debtRatio: number;
}

export interface AllocationItem {
  category: string;
  valueInBase: number;
  percentage: number;
}

export interface DeltaResult {
  absChange: number;
  pctChange: number;
  fromValue: number;
  toValue: number;
}

export interface DashboardSummary {
  totalNetWorth: number;
  todayChangeAbs: number;
  todayChangePct: number;
  monthChangeAbs: number;
  monthChangePct: number;
  yearChangeAbs: number;
  yearChangePct: number;
  assetAllocation: AllocationItem[];
  emergencyFundHealth: number;
  debtRatio: number;
  snapshots: SnapshotPoint[];
  hasAssets: boolean;
  baseCurrency: string;
}

export interface SnapshotPoint {
  date: string;
  netWorth: number;
}

@Injectable()
export class NetWorthService {
  private readonly logger = new Logger(NetWorthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly forex: CurrencyService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Core Calculation ─────────────────────────────────────────────────────

  /**
   * Calculate real-time net worth from live Asset / Liability rows.
   * Converts every monetary value to the user's baseCurrency.
   */
  async calculateNetWorth(userId: string): Promise<NetWorthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true },
    });
    const base = user.baseCurrency;

    const [assets, liabilities] = await Promise.all([
      this.prisma.asset.findMany({
        where: { userId, deletedAt: null },
        select: { type: true, currentValue: true, currencyCode: true },
      }),
      this.prisma.liability.findMany({
        where: { userId, deletedAt: null },
        select: { remainingBalance: true, currencyCode: true },
      }),
    ]);

    // Convert and aggregate assets
    const allocationMap = new Map<string, Decimal>();
    let totalAssets = new Decimal(0);

    for (const asset of assets) {
      const converted = await this.forex.convert(
        new Decimal(asset.currentValue.toString()),
        asset.currencyCode,
        base,
      );
      totalAssets = totalAssets.add(converted);
      const existing = allocationMap.get(asset.type) ?? new Decimal(0);
      allocationMap.set(asset.type, existing.add(converted));
    }

    // Convert and aggregate liabilities
    let totalLiabilities = new Decimal(0);
    for (const liability of liabilities) {
      const converted = await this.forex.convert(
        new Decimal(liability.remainingBalance.toString()),
        liability.currencyCode,
        base,
      );
      totalLiabilities = totalLiabilities.add(converted);
    }

    const netWorth = totalAssets.sub(totalLiabilities);

    // Build allocation array
    const assetAllocation: AllocationItem[] = [];
    allocationMap.forEach((value, category) => {
      assetAllocation.push({
        category,
        valueInBase: value.toNumber(),
        percentage: totalAssets.isZero() ? 0 : value.div(totalAssets).mul(100).toNumber(),
      });
    });
    assetAllocation.sort((a, b) => b.valueInBase - a.valueInBase);

    const debtRatio = totalAssets.isZero()
      ? 0
      : totalLiabilities.div(totalAssets).toNumber();

    return { totalAssets, totalLiabilities, netWorth, baseCurrency: base, assetAllocation, debtRatio };
  }

  // ─── Snapshots ────────────────────────────────────────────────────────────

  /**
   * Write today's net-worth snapshot for a user (upsert — safe to call multiple times).
   * Emits 'net-worth.updated' event for WebSocket push.
   */
  async writeSnapshot(userId: string): Promise<void> {
    const result = await this.calculateNetWorth(userId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await this.prisma.netWorthSnapshot.upsert({
      where: { userId_snapshotDate: { userId, snapshotDate: today } },
      create: {
        userId,
        totalAssets: result.totalAssets.toString(),
        totalLiabilities: result.totalLiabilities.toString(),
        netWorth: result.netWorth.toString(),
        baseCurrency: result.baseCurrency,
        snapshotDate: today,
      },
      update: {
        totalAssets: result.totalAssets.toString(),
        totalLiabilities: result.totalLiabilities.toString(),
        netWorth: result.netWorth.toString(),
      },
    });

    this.logger.log(`Snapshot written for user ${userId}: ${result.netWorth.toFixed(2)} ${result.baseCurrency}`);
    this.events.emit("net-worth.updated", { userId, snapshot });
  }

  /**
   * Get the 12-month trend (one snapshot per month, most recent first).
   */
  async getTrendSnapshots(userId: string): Promise<SnapshotPoint[]> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const snapshots = await this.prisma.netWorthSnapshot.findMany({
      where: { userId, snapshotDate: { gte: oneYearAgo } },
      orderBy: { snapshotDate: "asc" },
      select: { snapshotDate: true, netWorth: true },
    });

    return snapshots.map((s): SnapshotPoint => ({
      date: s.snapshotDate.toISOString().slice(0, 10),
      netWorth: new Decimal(s.netWorth.toString()).toNumber(),
    }));
  }

  /**
   * Calculate the change in net worth between now and a past snapshot.
   */
  async getDelta(userId: string, daysAgo: number): Promise<DeltaResult> {
    const [current, snapshots] = await Promise.all([
      this.calculateNetWorth(userId),
      this.prisma.netWorthSnapshot.findMany({
        where: {
          userId,
          snapshotDate: {
            lte: new Date(Date.now() - (daysAgo - 1) * 86400000),
          },
        },
        orderBy: { snapshotDate: "desc" },
        take: 1,
      }),
    ]);

    const currentValue = current.netWorth.toNumber();
    const pastValue = snapshots[0] ? new Decimal(snapshots[0].netWorth.toString()).toNumber() : currentValue;
    const absChange = currentValue - pastValue;
    const pctChange = pastValue !== 0 ? (absChange / Math.abs(pastValue)) * 100 : 0;

    return { absChange, pctChange, fromValue: pastValue, toValue: currentValue };
  }

  // ─── Full Dashboard Summary ───────────────────────────────────────────────

  async getDashboardSummary(userId: string): Promise<DashboardSummary> {
    const [current, todayDelta, monthDelta, yearDelta, snapshots] = await Promise.all([
      this.calculateNetWorth(userId),
      this.getDelta(userId, 1),
      this.getDelta(userId, 30),
      this.getDelta(userId, 365),
      this.getTrendSnapshots(userId),
    ]);

    // Emergency fund health: (cash assets) / (estimated monthly expenses)
    // Phase 2 placeholder: 3 months if cash > 0, else 0
    const cashValue = current.assetAllocation.find((a) => a.category === "CASH")?.valueInBase ?? 0;
    const emergencyFundHealth = cashValue > 0 ? Math.min(cashValue / 50000, 12) : 0; // Simplified

    return {
      totalNetWorth: current.netWorth.toNumber(),
      todayChangeAbs: todayDelta.absChange,
      todayChangePct: todayDelta.pctChange,
      monthChangeAbs: monthDelta.absChange,
      monthChangePct: monthDelta.pctChange,
      yearChangeAbs: yearDelta.absChange,
      yearChangePct: yearDelta.pctChange,
      assetAllocation: current.assetAllocation,
      emergencyFundHealth,
      debtRatio: current.debtRatio,
      snapshots,
      hasAssets: current.totalAssets.gt(0),
      baseCurrency: current.baseCurrency,
    };
  }
}
