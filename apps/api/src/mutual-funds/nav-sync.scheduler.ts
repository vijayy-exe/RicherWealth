import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NavSyncService } from "./nav-sync.service";

@Injectable()
export class NavSyncScheduler {
  private readonly logger = new Logger(NavSyncScheduler.name);
  private isRunning = false;

  constructor(private readonly navSync: NavSyncService) {}

  /**
   * Run NAV sync once daily at 08:00 IST (02:30 UTC).
   * MFAPI.in updates its data each business day after 23:00 IST (approx),
   * so fetching at 08:00 IST the following morning always captures the previous day's NAV.
   */
  @Cron("30 2 * * *") // 02:30 UTC = 08:00 IST
  async dailyNavSync(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("NAV sync already in progress, skipping tick");
      return;
    }

    this.isRunning = true;
    this.logger.log("Starting daily NAV sync");
    const start = Date.now();

    try {
      await this.navSync.syncAllActiveSchemes();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.logger.log(`NAV sync complete in ${elapsed}s`);
    } catch (err) {
      this.logger.error(`NAV sync failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
