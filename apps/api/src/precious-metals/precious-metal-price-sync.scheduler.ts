import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { PreciousMetalPriceSyncService } from "./precious-metal-price-sync.service";
import { PreciousMetalsService } from "./precious-metals.service";

@Injectable()
export class PreciousMetalPriceSyncScheduler {
  private readonly logger = new Logger(PreciousMetalPriceSyncScheduler.name);
  private isRunning = false;

  constructor(
    private readonly priceSync: PreciousMetalPriceSyncService,
    private readonly metalsService: PreciousMetalsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Gold/silver spot moves slowly — a 15-min cron matching the cache TTL is plenty. */
  @Cron("*/15 * * * *")
  async syncActiveHoldings(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Precious-metal price sync already in progress, skipping tick");
      return;
    }
    this.isRunning = true;
    const start = Date.now();

    try {
      const metals = await this.prisma.preciousMetalHolding.findMany({
        where: { asset: { deletedAt: null } },
        distinct: ["metalType"],
        select: { metalType: true },
      });
      if (metals.length === 0) return;

      for (const { metalType } of metals) {
        const price = await this.priceSync.refreshPrice(metalType);
        if (price) await this.metalsService.syncHoldingValues(metalType, price.pricePerGramUsd);
      }

      this.logger.log(`Precious-metal price sync complete in ${((Date.now() - start) / 1000).toFixed(1)}s (${metals.length} metal(s))`);
    } catch (err) {
      this.logger.error(`Precious-metal price sync failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
