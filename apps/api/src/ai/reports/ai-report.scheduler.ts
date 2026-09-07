import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { AI_REPORTS_QUEUE } from "./ai-report.processor";
import type { AiReportType } from "@prisma/client";

const CRON_BY_TYPE: Record<AiReportType, string> = {
  DAILY: "0 6 * * *", // 6am daily
  WEEKLY: "0 6 * * 1", // 6am Monday
  MONTHLY: "0 6 1 * *", // 6am 1st of month
  YEARLY: "0 6 1 1 *", // 6am Jan 1st
};

/** Same upsertJobScheduler pattern Phase 17 established for BullMQ v6 (the
 * old `add(name, data, {repeat})` form was removed in v6) — one repeatable
 * job per report cadence, plus an immediate one-off run of each so the
 * effect is visible without waiting for a real cron tick, safe because
 * `AiReportService.generateReport` is idempotent (upsert on
 * (userId, type, periodStart)). */
@Injectable()
export class AiReportScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiReportScheduler.name);

  constructor(@InjectQueue(AI_REPORTS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    for (const type of Object.keys(CRON_BY_TYPE) as AiReportType[]) {
      await this.queue.upsertJobScheduler(`ai-report-${type.toLowerCase()}`, { pattern: CRON_BY_TYPE[type] }, { name: "generate", data: { type } });
      await this.queue.add("generate-now", { type });
    }
    this.logger.log("AI report schedules registered (daily/weekly/monthly/yearly).");
  }
}
