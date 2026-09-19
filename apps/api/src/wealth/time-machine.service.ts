import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService, type SnapshotPoint } from "../net-worth/net-worth.service";
import { CurrencyService } from "../forex/currency.service";
import { ScenarioSimulatorService, type BaselineProjectionResult } from "./scenario-simulator.service";
import Decimal from "decimal.js";

export interface TimeMachineAllocationItem {
  category: string;
  valueInBase: number;
  percentage: number;
}

export interface TimeMachinePastState {
  requestedDate: string;
  /** The nearest ACTUAL NetWorthSnapshot date on or before requestedDate — may differ from it if snapshots are sparse. */
  snapshotDate: string;
  /** Exact — a real historical NetWorthSnapshot row, not reconstructed. */
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  baseCurrency: string;
  /** Approximate — see the class docstring for exactly why. */
  approximateAllocation: TimeMachineAllocationItem[];
  isApproximate: true;
}

export interface TimeMachineInsufficientData {
  insufficientData: true;
  reason: string;
}

/**
 * Phase 20 — Financial Time Machine / Wealth Timeline.
 *
 * Past net-worth TOTALS are EXACT: `NetWorthSnapshot` already has one real
 * row per user per day (Phase 9), so `reconstructPastState` just reads the
 * nearest one on or before the requested date — no reconstruction math at
 * all for the headline totalAssets/totalLiabilities/netWorth figures.
 *
 * Past ASSET ALLOCATION (the category breakdown) is APPROXIMATE, and always
 * flagged `isApproximate: true` — the same honesty discipline as Phase 15's
 * `isBackfillEstimate`: for each asset that existed as of the requested
 * date (created on/before it, not yet deleted), this walks it back to its
 * nearest prior `AssetRevaluation.valuedAt <= date` when one exists;
 * otherwise it falls back to the asset's CURRENT value, which is simply
 * wrong for the past and is never hidden. Two real limitations, stated
 * plainly rather than silently smoothed over:
 *   1. No since-sold-asset ledger exists, so an asset the user has since
 *      fully divested is invisible to a past reconstruction, even though it
 *      may have been a real part of their portfolio on that date.
 *   2. Any asset with no revaluation history before the requested date
 *      reads at TODAY's value for that past date — the fallback above.
 *
 * "Project forward" (the timeline's future half) delegates entirely to
 * `ScenarioSimulatorService.projectBaseline` (Item 1) — this service does
 * NOT re-derive any Monte Carlo math of its own.
 */
@Injectable()
export class TimeMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly currency: CurrencyService,
    private readonly scenarioSimulator: ScenarioSimulatorService,
  ) {}

  /** The timeline's real backbone — exact daily/monthly net-worth history, reused verbatim from Phase 9. */
  async getTimeline(userId: string): Promise<SnapshotPoint[]> {
    return this.netWorth.getTrendSnapshots(userId);
  }

  async reconstructPastState(userId: string, requestedDate: Date): Promise<TimeMachinePastState | TimeMachineInsufficientData> {
    const snapshot = await this.prisma.netWorthSnapshot.findFirst({
      where: { userId, snapshotDate: { lte: requestedDate } },
      orderBy: { snapshotDate: "desc" },
    });
    if (!snapshot) {
      return { insufficientData: true, reason: "No net-worth history exists on or before this date yet." };
    }

    const approximateAllocation = await this.reconstructApproximateAllocation(userId, requestedDate, snapshot.baseCurrency);

    return {
      requestedDate: requestedDate.toISOString().slice(0, 10),
      snapshotDate: snapshot.snapshotDate.toISOString().slice(0, 10),
      totalAssets: new Decimal(snapshot.totalAssets.toString()).toNumber(),
      totalLiabilities: new Decimal(snapshot.totalLiabilities.toString()).toNumber(),
      netWorth: new Decimal(snapshot.netWorth.toString()).toNumber(),
      baseCurrency: snapshot.baseCurrency,
      approximateAllocation,
      isApproximate: true,
    };
  }

  /** Reuses Item 1's simulator directly — no separate projection math here. */
  async projectForward(userId: string, horizonYears = 10, monthlyContribution = 0): Promise<BaselineProjectionResult> {
    return this.scenarioSimulator.projectBaseline(userId, horizonYears, monthlyContribution);
  }

  // ─── Internal: approximate past-allocation reconstruction ────────────────

  private async reconstructApproximateAllocation(userId: string, asOfDate: Date, baseCurrency: string): Promise<TimeMachineAllocationItem[]> {
    // Assets that existed AT asOfDate: created on/before it, and either
    // still active or not (soft-)deleted until after it.
    const assets = await this.prisma.asset.findMany({
      where: { userId, createdAt: { lte: asOfDate }, OR: [{ deletedAt: null }, { deletedAt: { gt: asOfDate } }] },
      select: { id: true, type: true, currentValue: true, currencyCode: true },
    });
    if (assets.length === 0) return [];

    // One query for every asset's revaluation history up to asOfDate,
    // globally sorted most-recent-first -- the first occurrence of each
    // assetId in this flat, sorted list IS that asset's nearest prior
    // revaluation, without needing N separate queries.
    const revaluations = await this.prisma.assetRevaluation.findMany({
      where: { userId, assetId: { in: assets.map((a) => a.id) }, valuedAt: { lte: asOfDate } },
      orderBy: { valuedAt: "desc" },
      select: { assetId: true, value: true, currency: true },
    });
    const nearestByAsset = new Map<string, { value: Decimal; currency: string }>();
    for (const r of revaluations) {
      if (!nearestByAsset.has(r.assetId)) nearestByAsset.set(r.assetId, { value: new Decimal(r.value.toString()), currency: r.currency });
    }

    const byCategory = new Map<string, Decimal>();
    let total = new Decimal(0);
    for (const asset of assets) {
      const revaluation = nearestByAsset.get(asset.id);
      const nativeValue = revaluation ? revaluation.value : new Decimal(asset.currentValue.toString());
      const nativeCurrency = revaluation ? revaluation.currency : asset.currencyCode;
      const converted = await this.currency.convert(nativeValue, nativeCurrency, baseCurrency);
      byCategory.set(asset.type, (byCategory.get(asset.type) ?? new Decimal(0)).add(converted));
      total = total.add(converted);
    }

    const out: TimeMachineAllocationItem[] = [];
    byCategory.forEach((value, category) => {
      out.push({ category, valueInBase: value.toNumber(), percentage: total.isZero() ? 0 : value.div(total).mul(100).toNumber() });
    });
    out.sort((a, b) => b.valueInBase - a.valueInBase);
    return out;
  }
}
