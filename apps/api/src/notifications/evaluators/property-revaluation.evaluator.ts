import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationDispatchService } from "../notification-dispatch.service";
import Decimal from "decimal.js";

/** A revaluation delta at or beyond this magnitude (either direction) is worth surfacing. */
export const PROPERTY_CHANGE_THRESHOLD_PCT = 5;

export function pctChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Real estate/other illiquid assets have no live price feed (Phase 14's
 * MarketDataService is explicit about this) — the only "price" signal is
 * whatever the user manually logs via AssetRevaluation. This runs as a
 * daily scan (not an event hook into the real-estate module, to avoid
 * touching Phase 8's code) comparing each asset's two most recent
 * revaluations; idempotency (sourceEntityId = the NEW revaluation's id) is
 * what makes re-scanning the same history every day harmless.
 */
@Injectable()
export class PropertyRevaluationEvaluator {
  private readonly logger = new Logger(PropertyRevaluationEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async evaluate(): Promise<void> {
    const assets = await this.prisma.asset.findMany({
      where: { deletedAt: null, revaluations: { some: {} } },
      select: {
        id: true,
        userId: true,
        name: true,
        revaluations: { orderBy: { valuedAt: "desc" }, take: 2 },
      },
    });

    let notified = 0;
    for (const asset of assets) {
      if (asset.revaluations.length < 2) continue;
      const [latest, previous] = asset.revaluations;
      const currentValue = new Decimal(latest!.value.toString()).toNumber();
      const previousValue = new Decimal(previous!.value.toString()).toNumber();
      const delta = pctChange(previousValue, currentValue);
      if (delta === null || Math.abs(delta) < PROPERTY_CHANGE_THRESHOLD_PCT) continue;

      const direction = delta > 0 ? "up" : "down";
      const { created } = await this.dispatch.notifyOnce({
        userId: asset.userId,
        type: "PROPERTY_PRICE_CHANGE",
        title: `${asset.name} revalued ${direction} ${Math.abs(delta).toFixed(1)}%`,
        body: `A new valuation moved ${asset.name} from ${previousValue} to ${currentValue} ${latest!.currency} (${delta > 0 ? "+" : ""}${delta.toFixed(1)}%).`,
        data: { assetId: asset.id, previousValue, currentValue, deltaPct: delta },
        sourceEntityId: latest!.id,
        triggerBucket: "ONCE",
      });
      if (created) notified++;
    }
    this.logger.log(`Property revaluation evaluation: ${notified} new notifications across ${assets.length} revalued assets.`);
  }
}
