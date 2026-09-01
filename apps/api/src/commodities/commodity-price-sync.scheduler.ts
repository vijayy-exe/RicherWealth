import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { CommodityPriceSyncService, type CommodityCode } from "./commodity-price-sync.service";
import { CommoditiesService } from "./commodities.service";

@Injectable()
export class CommodityPriceSyncScheduler {
  private readonly logger = new Logger(CommodityPriceSyncScheduler.name);
  private isRunning = false;

  constructor(
    private readonly priceSync: CommodityPriceSyncService,
    private readonly commoditiesService: CommoditiesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Futures settle roughly once/day; a 15-min cron matching the cache TTL is
   * plenty, and the small 6-commodity universe (max) means this never
   * threatens the shared Alpha Vantage budget even when that key is set.
   */
  @Cron("*/15 * * * *")
  async syncActiveHoldings(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Commodity price sync already in progress, skipping tick");
      return;
    }
    this.isRunning = true;
    const start = Date.now();

    try {
      const held = await this.prisma.commodityHolding.findMany({
        where: { asset: { deletedAt: null } },
        distinct: ["commodityType"],
        select: { commodityType: true },
      });
      if (held.length === 0) return;

      for (const { commodityType } of held) {
        const price = await this.priceSync.getPrice(commodityType as CommodityCode);
        if (price) await this.commoditiesService.syncHoldingValues(commodityType as CommodityCode, price.price);
      }

      this.logger.log(`Commodity price sync complete in ${((Date.now() - start) / 1000).toFixed(1)}s (${held.length} commodities)`);
    } catch (err) {
      this.logger.error(`Commodity price sync failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
