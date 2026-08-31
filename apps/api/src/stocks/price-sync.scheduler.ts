import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PriceSyncService } from "./price-sync.service";
import { StocksService } from "./stocks.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PriceSyncScheduler {
  private readonly logger = new Logger(PriceSyncScheduler.name);
  private isRunning = false;

  constructor(
    private readonly priceSync: PriceSyncService,
    private readonly stocks: StocksService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Refresh all active stock prices every 15 minutes.
   * Respects Alpha Vantage free tier: max 5 req/min (12s apart).
   * After each ticker refresh, syncs Asset.currentValue and triggers
   * WebSocket push via StocksService.syncHoldingValues().
   */
  @Cron("*/15 * * * *")
  async refreshAllPrices(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Price sync already running, skipping this tick");
      return;
    }

    this.isRunning = true;
    const start = Date.now();

    try {
      // Get distinct tickers from active (non-deleted) holdings
      const holdings = await this.prisma.stockHolding.findMany({
        where: { asset: { deletedAt: null } },
        distinct: ["ticker", "exchange"],
        select: { ticker: true, exchange: true },
      });

      if (holdings.length === 0) {
        this.logger.debug("No active holdings to sync");
        return;
      }

      this.logger.log(`Starting price sync for ${holdings.length} tickers`);

      for (const { ticker, exchange } of holdings) {
        try {
          const price = await this.priceSync.refreshPrice(ticker, exchange);
          if (price) {
            await this.stocks.syncHoldingValues(ticker, exchange, price.price);
            this.logger.debug(`✓ ${ticker}:${exchange} → ${price.price} (${price.provider})`);
          } else {
            this.logger.warn(`✗ ${ticker}:${exchange} — price unavailable (stale state shown)`);
          }
        } catch (err) {
          this.logger.error(`Failed to sync ${ticker}:${exchange}`, String(err));
        }

        // Respect free-tier rate limits: 12s between calls (5 req/min)
        await new Promise((r) => setTimeout(r, 12_000));
      }

      const durationSec = ((Date.now() - start) / 1000).toFixed(1);
      this.logger.log(`Price sync complete: ${holdings.length} tickers in ${durationSec}s`);
    } finally {
      this.isRunning = false;
    }
  }
}
