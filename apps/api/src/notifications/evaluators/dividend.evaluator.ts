import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationDispatchService } from "../notification-dispatch.service";
import Decimal from "decimal.js";

/**
 * Dividends ride the existing Income model (sourceType: DIVIDENDS, wired in
 * Phase 15) — no new dividend table. Runs as a daily scan rather than
 * hooking into IncomeService's create path (lower-risk: doesn't touch
 * Phase 10's income module) and relies entirely on the Notification unique
 * constraint for idempotency: every DIVIDENDS income row created since ever
 * is re-considered every run, but notifyOnce is a no-op past the first time
 * for a given income row (sourceEntityId = income.id, triggerBucket "ONCE").
 * A daily cadence is honest here — the user's brief lists this alongside
 * daily due-date checks, and a dividend record showing up a few hours late
 * in the feed doesn't materially change anything.
 */
@Injectable()
export class DividendEvaluator {
  private readonly logger = new Logger(DividendEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async evaluate(): Promise<void> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dividends = await this.prisma.income.findMany({
      where: { sourceType: "DIVIDENDS", deletedAt: null, createdAt: { gte: ninetyDaysAgo } },
      orderBy: { createdAt: "desc" },
    });

    let notified = 0;
    for (const income of dividends) {
      const amount = new Decimal(income.amount.toString()).toNumber();
      const { created } = await this.dispatch.notifyOnce({
        userId: income.userId,
        type: "DIVIDEND_RECEIVED",
        title: `Dividend received: ${income.name}`,
        body: `${amount} ${income.currencyCode} recorded from ${income.name}.`,
        data: { incomeId: income.id, amount, currencyCode: income.currencyCode },
        sourceEntityId: income.id,
        triggerBucket: "ONCE",
      });
      if (created) notified++;
    }
    this.logger.log(`Dividend evaluation: ${notified} new notifications out of ${dividends.length} dividend records scanned.`);
  }
}
