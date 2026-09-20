import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { CurrencyService } from "../forex/currency.service";
import { TransactionsService } from "../transactions/transactions.service";
import Decimal from "decimal.js";

export interface NetWorthResult {
  totalAssets: Decimal;
  totalLiabilities: Decimal;
  netWorth: Decimal;
  baseCurrency: string;
  assetAllocation: AllocationItem[];
  currencyExposure: CurrencyExposureItem[];
  debtRatio: number;
}

export interface AllocationItem {
  category: string;
  valueInBase: number;
  percentage: number;
}

export interface CurrencyExposureItem {
  currency: string;
  nativeValue: number;
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
  currencyExposure: CurrencyExposureItem[];
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
    private readonly transactions: TransactionsService,
  ) {}

  // ─── Core Calculation ─────────────────────────────────────────────────────

  /**
   * Calculate real-time net worth from live Asset / Liability rows.
   * Converts every monetary value to the user's baseCurrency.
   *
   * Phase 21: also includes, at FULL value, any household-owned (joint)
   * asset/liability belonging to a household this user is a member of —
   * so a spouse's own dashboard shows "our house" as the real value, not a
   * fraction. This is deliberately NOT how the household aggregate
   * (calculateHouseholdNetWorth below) avoids double-counting — the
   * aggregate re-queries a deduplicated union rather than summing
   * individual views, so summing N members' individual net worths would
   * NOT equal the household aggregate, and must never be done.
   */
  async calculateNetWorth(userId: string): Promise<NetWorthResult> {
    const [user, householdIds] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { baseCurrency: true },
      }),
      this.prisma.householdMember.findMany({ where: { userId }, select: { householdId: true } }),
    ]);
    const base = user.baseCurrency;
    const memberOfHouseholdIds = householdIds.map((h) => h.householdId);
    const ownedOrJointOr = [
      { userId, householdId: null },
      ...(memberOfHouseholdIds.length > 0 ? [{ householdId: { in: memberOfHouseholdIds } }] : []),
    ];

    const [assets, liabilities] = await Promise.all([
      this.prisma.asset.findMany({
        where: { deletedAt: null, OR: ownedOrJointOr },
        select: { type: true, currentValue: true, currencyCode: true },
      }),
      this.prisma.liability.findMany({
        where: { deletedAt: null, OR: ownedOrJointOr },
        select: { remainingBalance: true, currencyCode: true },
      }),
    ]);

    return this.aggregate(assets, liabilities, base);
  }

  /**
   * Household aggregate net worth: every unique asset/liability visible to
   * the household counted EXACTLY ONCE — household-owned rows, plus each
   * member's own personally-owned (non-joint) rows. This is a fresh
   * deduplicated query, not a sum of members' calculateNetWorth() results
   * (which would double-count a joint asset once per member showing it at
   * full value) — structurally impossible to double-count as a result.
   */
  async calculateHouseholdNetWorth(householdId: string): Promise<NetWorthResult> {
    const [household, members] = await Promise.all([
      this.prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { baseCurrency: true } }),
      this.prisma.householdMember.findMany({ where: { householdId }, select: { userId: true } }),
    ]);
    const base = household.baseCurrency;
    const memberIds = members.map((m) => m.userId);

    const uniqueToHousehold = {
      OR: [
        { householdId },
        { userId: { in: memberIds }, householdId: null },
      ],
    };

    const [assets, liabilities] = await Promise.all([
      this.prisma.asset.findMany({
        where: { deletedAt: null, ...uniqueToHousehold },
        select: { type: true, currentValue: true, currencyCode: true },
      }),
      this.prisma.liability.findMany({
        where: { deletedAt: null, ...uniqueToHousehold },
        select: { remainingBalance: true, currencyCode: true },
      }),
    ]);

    return this.aggregate(assets, liabilities, base);
  }

  private async aggregate(
    assets: Array<{ type: string; currentValue: Decimal | string; currencyCode: string }>,
    liabilities: Array<{ remainingBalance: Decimal | string; currencyCode: string }>,
    base: string,
  ): Promise<NetWorthResult> {
    // Convert and aggregate assets
    const allocationMap = new Map<string, Decimal>();
    const exposureMap = new Map<string, { native: Decimal; base: Decimal }>();
    let totalAssets = new Decimal(0);

    for (const asset of assets) {
      const nativeValue = new Decimal(asset.currentValue.toString());
      const converted = await this.forex.convert(nativeValue, asset.currencyCode, base);
      totalAssets = totalAssets.add(converted);

      const existing = allocationMap.get(asset.type) ?? new Decimal(0);
      allocationMap.set(asset.type, existing.add(converted));

      const exposure = exposureMap.get(asset.currencyCode) ?? { native: new Decimal(0), base: new Decimal(0) };
      exposure.native = exposure.native.add(nativeValue);
      exposure.base = exposure.base.add(converted);
      exposureMap.set(asset.currencyCode, exposure);
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

    const currencyExposure: CurrencyExposureItem[] = [];
    exposureMap.forEach(({ native, base: baseValue }, currency) => {
      currencyExposure.push({
        currency,
        nativeValue: native.toNumber(),
        valueInBase: baseValue.toNumber(),
        percentage: totalAssets.isZero() ? 0 : baseValue.div(totalAssets).mul(100).toNumber(),
      });
    });
    currencyExposure.sort((a, b) => b.valueInBase - a.valueInBase);

    const debtRatio = totalAssets.isZero()
      ? 0
      : totalLiabilities.div(totalAssets).toNumber();

    return { totalAssets, totalLiabilities, netWorth, baseCurrency: base, assetAllocation, currencyExposure, debtRatio };
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
   *
   * Phase 22: `current` may be passed in already-computed — a k6 load
   * test surfaced that a single dashboard load was calling
   * `calculateNetWorth` 5 independent times (this method 3x via
   * getDashboardSummary's today/month/year deltas, once more via a
   * separate getAssetGrowthRate call, plus getDashboardSummary's own
   * direct call), each a full DB round trip, each now slightly heavier
   * since Phase 21 added a household-membership lookup to it — measured
   * as part of the real p95 latency under concurrent load. Optional and
   * backward-compatible: existing external callers (e.g. ai-report.service)
   * that don't pass it still get the original single-call behavior.
   */
  async getDelta(userId: string, daysAgo: number, current?: NetWorthResult): Promise<DeltaResult> {
    const [resolvedCurrent, snapshots] = await Promise.all([
      current ? Promise.resolve(current) : this.calculateNetWorth(userId),
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

    const currentValue = resolvedCurrent.netWorth.toNumber();
    const pastValue = snapshots[0] ? new Decimal(snapshots[0].netWorth.toString()).toNumber() : currentValue;
    const absChange = currentValue - pastValue;
    const pctChange = pastValue !== 0 ? (absChange / Math.abs(pastValue)) * 100 : 0;

    return { absChange, pctChange, fromValue: pastValue, toValue: currentValue };
  }

  /**
   * Year-over-year growth rate of total ASSETS (not net worth — asset value
   * alone, unaffected by debt paydown) — used as the "investment return"
   * side of the debt-cost-vs-investment-return comparison. Reuses the same
   * NetWorthSnapshot rows getDelta() reads, just projecting totalAssets
   * instead of netWorth.
   */
  async getAssetGrowthRate(userId: string, daysAgo: number, current?: NetWorthResult): Promise<DeltaResult> {
    const [resolvedCurrent, snapshots] = await Promise.all([
      current ? Promise.resolve(current) : this.calculateNetWorth(userId),
      this.prisma.netWorthSnapshot.findMany({
        where: { userId, snapshotDate: { lte: new Date(Date.now() - (daysAgo - 1) * 86400000) } },
        orderBy: { snapshotDate: "desc" },
        take: 1,
      }),
    ]);

    const currentValue = resolvedCurrent.totalAssets.toNumber();
    const pastValue = snapshots[0] ? new Decimal(snapshots[0].totalAssets.toString()).toNumber() : currentValue;
    const absChange = currentValue - pastValue;
    const pctChange = pastValue !== 0 ? (absChange / Math.abs(pastValue)) * 100 : 0;

    return { absChange, pctChange, fromValue: pastValue, toValue: currentValue };
  }

  // ─── Full Dashboard Summary ───────────────────────────────────────────────

  async getDashboardSummary(userId: string, precomputed?: NetWorthResult): Promise<DashboardSummary> {
    const current = precomputed ?? (await this.calculateNetWorth(userId));
    const [todayDelta, monthDelta, yearDelta, snapshots] = await Promise.all([
      this.getDelta(userId, 1, current),
      this.getDelta(userId, 30, current),
      this.getDelta(userId, 365, current),
      this.getTrendSnapshots(userId),
    ]);

    // Emergency fund health: (cash assets) / (estimated monthly expenses).
    // Fix Audit M-02: this used to unconditionally divide by a bare 50000
    // regardless of the account's currency -- a real USD account with
    // $2,607.50 cash rendered as "0.1 months," reading as broken. Now uses
    // the real trailing-3-month expense average (Phase 10, DashboardResolver
    // already computed this correctly for the GraphQL dashboard query but
    // this method itself -- also called directly by AI reports, RAG
    // indexing, and PDF reports, none of which went through that resolver's
    // override -- never did). Falls back to the old placeholder, now
    // properly currency-converted via the real forex rate rather than a
    // bare constant, only when there's no expense history yet.
    const cashValue = current.assetAllocation.find((a) => a.category === "CASH")?.valueInBase ?? 0;
    let emergencyFundHealth = 0;
    if (cashValue > 0) {
      const avgMonthlyExpense = await this.transactions.getAverageMonthlyExpense(userId, 3);
      const monthlyExpenseEstimate =
        avgMonthlyExpense && avgMonthlyExpense > 0
          ? avgMonthlyExpense
          : (await this.forex.convert(new Decimal(50_000), "INR", current.baseCurrency)).toNumber();
      emergencyFundHealth = monthlyExpenseEstimate > 0 ? Math.min(cashValue / monthlyExpenseEstimate, 12) : 0;
    }

    return {
      totalNetWorth: current.netWorth.toNumber(),
      todayChangeAbs: todayDelta.absChange,
      todayChangePct: todayDelta.pctChange,
      monthChangeAbs: monthDelta.absChange,
      monthChangePct: monthDelta.pctChange,
      yearChangeAbs: yearDelta.absChange,
      yearChangePct: yearDelta.pctChange,
      assetAllocation: current.assetAllocation,
      currencyExposure: current.currencyExposure,
      emergencyFundHealth,
      debtRatio: current.debtRatio,
      snapshots,
      hasAssets: current.totalAssets.gt(0),
      baseCurrency: current.baseCurrency,
    };
  }
}
