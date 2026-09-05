import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PriceSyncService } from "../stocks/price-sync.service";
import type { HoldingMoverQuote } from "@richer/shared-types";

/**
 * "Top movers" among the user's OWN stock holdings — derived entirely from
 * PriceSyncService's already-cached prices (Phase 4's scheduler keeps these
 * warm), so this never issues a new external API call on its own; a
 * genuine cache miss just falls through to PriceSyncService's normal
 * refresh path, same as any other stocks-module consumer.
 */
@Injectable()
export class MoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceSync: PriceSyncService,
  ) {}

  async getUserMovers(userId: string): Promise<{ gainers: HoldingMoverQuote[]; losers: HoldingMoverQuote[] }> {
    const holdings = await this.prisma.stockHolding.findMany({
      where: { userId, asset: { deletedAt: null } },
      select: { id: true, ticker: true, exchange: true },
    });

    const quotes: HoldingMoverQuote[] = [];
    for (const h of holdings) {
      const price = await this.priceSync.getPrice(h.ticker, h.exchange);
      if (!price || price.previousClose === null || price.previousClose === 0) continue;
      const changePct = ((price.price - price.previousClose) / price.previousClose) * 100;
      quotes.push({
        holdingId: h.id,
        symbol: h.ticker,
        label: `${h.ticker} (${h.exchange})`,
        price: price.price,
        previousClose: price.previousClose,
        changePct,
        currency: price.currency,
        provider: price.provider,
        fetchedAt: price.fetchedAt,
        isStale: price.isStale,
      });
    }

    const sorted = [...quotes].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    return {
      gainers: sorted.filter((q) => (q.changePct ?? 0) > 0).slice(0, 5),
      losers: sorted.filter((q) => (q.changePct ?? 0) < 0).slice(-5).reverse(),
    };
  }
}
