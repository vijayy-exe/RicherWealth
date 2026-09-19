import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { AI_SUGGESTION_SCAN_QUEUE } from "./ai-suggestion-scan.processor";

/** Every 6 hours — the AI CFO / Copilot should notice a change in the
 * user's financial picture well within a day, but doesn't need to be
 * real-time (every underlying check here is already itself real-time-
 * queryable on demand via `POST /ai/suggestions/generate`; this schedule is
 * what makes it PROACTIVE instead of only reactive). Same
 * upsertJobScheduler + immediate boot run pattern Phase 19's
 * AiReportScheduler established (BullMQ v6 removed the old
 * `add(name, data, {repeat})` form) — safe because
 * `SuggestionEngineService.generateForUser` is fully idempotent. */
const CRON_EVERY_6_HOURS = "0 */6 * * *";

@Injectable()
export class AiSuggestionScanScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiSuggestionScanScheduler.name);

  constructor(@InjectQueue(AI_SUGGESTION_SCAN_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler("ai-suggestion-scan-6h", { pattern: CRON_EVERY_6_HOURS }, { name: "scan" });
    await this.queue.add("scan-now", {});
    this.logger.log("AI CFO / Copilot suggestion scan schedule registered (every 6h).");
  }
}
