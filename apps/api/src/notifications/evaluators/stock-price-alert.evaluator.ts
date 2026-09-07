import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PriceSyncService } from "../../stocks/price-sync.service";
import { NotificationDispatchService } from "../notification-dispatch.service";
import { isAlertHit } from "./crypto-price-alert.evaluator";
import Decimal from "decimal.js";

/**
 * Mirrors CryptoPriceAlertEvaluator exactly, against the new StockPriceAlert
 * model (added this phase — no equivalent existed before, unlike crypto's
 * which Phase 6 already persisted) and PriceSyncService's existing
 * Yahoo→TwelveData→AlphaVantage→Finnhub fallback chain — no new price fetch.
 */
@Injectable()
export class StockPriceAlertEvaluator {
  private readonly logger = new Logger(StockPriceAlertEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceSync: PriceSyncService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async evaluate(): Promise<void> {
    const pending = await this.prisma.stockPriceAlert.findMany({ where: { triggeredAt: null } });
    let hits = 0;

    for (const alert of pending) {
      const live = await this.priceSync.getPrice(alert.ticker, alert.exchange);
      if (!live) continue;

      const targetPrice = new Decimal(alert.targetPrice.toString()).toNumber();
      if (!isAlertHit({ targetPrice, direction: alert.direction }, live.price)) continue;

      const { created } = await this.dispatch.notifyOnce({
        userId: alert.userId,
        type: "STOCK_PRICE_ALERT",
        title: `${alert.ticker} hit ${alert.direction === "ABOVE" ? "above" : "below"} ${targetPrice}`,
        body: `${alert.ticker} (${alert.exchange}) is now ${live.price} ${live.currency} — your ${alert.direction.toLowerCase()} target of ${targetPrice} was reached.`,
        data: { ticker: alert.ticker, exchange: alert.exchange, targetPrice, currentPrice: live.price, direction: alert.direction },
        sourceEntityId: alert.id,
        triggerBucket: "ONCE",
      });

      if (created) {
        await this.prisma.stockPriceAlert.update({ where: { id: alert.id }, data: { triggeredAt: new Date() } });
        hits++;
      }
    }
    this.logger.log(`Stock price alert evaluation: ${hits}/${pending.length} alerts triggered.`);
  }
}
