import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { IndicesService } from "../../market-intelligence/indices.service";
import { NotificationDispatchService } from "../notification-dispatch.service";

/** A drop of this magnitude or worse on a tracked index counts as a "crash" alert. */
export const CRASH_THRESHOLD_PCT = -3;

export interface IndexQuoteLike {
  symbol: string;
  label: string;
  changePct: number | null;
}

/** Pure predicate, exported for direct unit testing without touching Prisma/HTTP. */
export function isCrash(quote: IndexQuoteLike): boolean {
  return quote.changePct !== null && quote.changePct <= CRASH_THRESHOLD_PCT;
}

function todayBucket(): string {
  return new Date().toISOString().slice(0, 10); // yyyy-mm-dd — allows re-firing on a later day if still crashed
}

/**
 * Reuses Phase 14's IndicesService (Yahoo Finance, same 15min/6h cache
 * cadence) — no second index-fetch path. Notifies every user once per
 * (index, day) a crash condition holds; this is a broadcast alert (not
 * tied to what any individual user holds), matching what a "market crash"
 * alert reasonably means.
 */
@Injectable()
export class MarketCrashEvaluator {
  private readonly logger = new Logger(MarketCrashEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indices: IndicesService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async evaluate(): Promise<void> {
    const quotes = await this.indices.getIndices();
    const crashed = quotes.filter(isCrash);
    if (crashed.length === 0) return;

    const userIds = await this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } });
    const bucket = todayBucket();

    for (const quote of crashed) {
      for (const { id: userId } of userIds) {
        await this.dispatch.notifyOnce({
          userId,
          type: "MARKET_CRASH",
          title: `${quote.label} is down ${quote.changePct!.toFixed(1)}%`,
          body: `${quote.label} has dropped ${Math.abs(quote.changePct!).toFixed(1)}% today — a sharp single-day move.`,
          data: { symbol: quote.symbol, changePct: quote.changePct },
          sourceEntityId: quote.symbol,
          triggerBucket: bucket,
        });
      }
    }
    this.logger.log(`Market crash evaluation: ${crashed.length}/${quotes.length} indices crashed, notified ${userIds.length} users where new.`);
  }
}
