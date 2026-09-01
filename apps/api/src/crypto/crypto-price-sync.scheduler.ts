import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoPriceSyncService } from "./crypto-price-sync.service";
import { CryptoService } from "./crypto.service";

@Injectable()
export class CryptoPriceSyncScheduler {
  private readonly logger = new Logger(CryptoPriceSyncScheduler.name);
  private isRunning = false;

  constructor(
    private readonly priceSync: CryptoPriceSyncService,
    private readonly cryptoService: CryptoService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Crypto trades 24/7 (unlike stocks with market hours), and CoinGecko's
   * free tier bulk endpoint returns every held coin in a single call, so a
   * tighter cadence than stocks' 15-min cron is safe within the 10-30
   * calls/min free-tier limit.
   */
  @Cron("*/5 * * * *")
  async syncActiveHoldings(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Crypto price sync already in progress, skipping tick");
      return;
    }
    this.isRunning = true;
    const start = Date.now();

    try {
      const holdings = await this.prisma.cryptoHolding.findMany({
        where: { asset: { deletedAt: null } },
        distinct: ["coinId", "currency"],
        select: { coinId: true, currency: true },
      });
      const coinIds = [...new Set(holdings.map((h) => h.coinId))];
      const currencies = [...new Set(holdings.map((h) => h.currency))];
      if (coinIds.length === 0) return;

      const prices = await this.priceSync.refreshPrices(coinIds, currencies);
      for (const price of prices.values()) {
        await this.cryptoService.syncHoldingValues(price.coinId, price.currency, price.price);
      }

      this.logger.log(`Crypto price sync complete in ${((Date.now() - start) / 1000).toFixed(1)}s (${prices.size} coin×currency pairs)`);
    } catch (err) {
      this.logger.error(`Crypto price sync failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
