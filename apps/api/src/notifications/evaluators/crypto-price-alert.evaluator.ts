import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CryptoPriceSyncService } from "../../crypto/crypto-price-sync.service";
import { NotificationDispatchService } from "../notification-dispatch.service";
import Decimal from "decimal.js";

export interface PriceAlertLike {
  targetPrice: number;
  direction: "ABOVE" | "BELOW";
}

/** Pure predicate — one-shot: an ABOVE alert fires once the price is at or
 * above target, a BELOW alert once it's at or below. */
export function isAlertHit(alert: PriceAlertLike, currentPrice: number): boolean {
  return alert.direction === "ABOVE" ? currentPrice >= alert.targetPrice : currentPrice <= alert.targetPrice;
}

/**
 * Evaluates Phase 6's CryptoPriceAlert rows (persisted since Phase 6,
 * explicitly commented "delivery is Phase 17") against live CoinGecko
 * prices via CryptoPriceSyncService — no second price-fetch path. One-shot:
 * once hit, `triggeredAt` is stamped so it never fires again (the
 * Notification unique constraint is a second, redundant guard).
 */
@Injectable()
export class CryptoPriceAlertEvaluator {
  private readonly logger = new Logger(CryptoPriceAlertEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceSync: CryptoPriceSyncService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  async evaluate(): Promise<void> {
    const pending = await this.prisma.cryptoPriceAlert.findMany({ where: { triggeredAt: null } });
    let hits = 0;

    for (const alert of pending) {
      const live = await this.priceSync.getPrice(alert.coinId, alert.currency);
      if (!live) continue;

      const targetPrice = new Decimal(alert.targetPrice.toString()).toNumber();
      if (!isAlertHit({ targetPrice, direction: alert.direction }, live.price)) continue;

      const { created } = await this.dispatch.notifyOnce({
        userId: alert.userId,
        type: "CRYPTO_PRICE_ALERT",
        title: `${alert.symbol} hit ${alert.direction === "ABOVE" ? "above" : "below"} ${targetPrice}`,
        body: `${alert.symbol} is now ${live.price} ${alert.currency} — your ${alert.direction.toLowerCase()} target of ${targetPrice} was reached.`,
        data: { coinId: alert.coinId, symbol: alert.symbol, targetPrice, currentPrice: live.price, direction: alert.direction },
        sourceEntityId: alert.id,
        triggerBucket: "ONCE",
      });

      if (created) {
        await this.prisma.cryptoPriceAlert.update({ where: { id: alert.id }, data: { triggeredAt: new Date() } });
        hits++;
      }
    }
    this.logger.log(`Crypto price alert evaluation: ${hits}/${pending.length} alerts triggered.`);
  }
}
