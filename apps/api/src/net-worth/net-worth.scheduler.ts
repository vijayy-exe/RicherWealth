import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { NetWorthService } from "./net-worth.service";

/**
 * NetWorthScheduler — runs nightly snapshot job at midnight UTC.
 * Iterates over all active (non-deleted) users and writes a snapshot.
 */
@Injectable()
export class NetWorthScheduler {
  private readonly logger = new Logger(NetWorthScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorthService: NetWorthService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleNightlySnapshot(): Promise<void> {
    this.logger.log("Starting nightly net-worth snapshot job");

    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    let success = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.netWorthService.writeSnapshot(user.id);
        success++;
      } catch (err) {
        this.logger.error(`Snapshot failed for user ${user.id}`, err);
        failed++;
      }
    }

    this.logger.log(`Nightly snapshot complete: ${success} success, ${failed} failed`);
  }
}
