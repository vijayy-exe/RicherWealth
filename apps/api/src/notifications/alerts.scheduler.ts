import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { ALERTS_FAST_QUEUE, ALERTS_DAILY_QUEUE, FAST_INTERVAL_MS, DAILY_INTERVAL_MS } from "./alerts.constants";

/** Registers the two repeatable jobs on boot via BullMQ v6's job-scheduler
 * API (the old `add(name, data, {repeat})` form was removed in v6 in favor
 * of `upsertJobScheduler` — see bullmq's job-options.d.ts). "Upsert" is the
 * operative word: re-registering the same schedulerId on every app restart
 * (this repo's `nest start --watch` restarts constantly during dev) just
 * replaces the existing schedule, it does not create duplicates. Also
 * fires one immediate one-off run of each so the effect is visible without
 * waiting out a full interval, which is safe because every evaluator is
 * itself idempotent via NotificationDispatchService's unique-constraint
 * guard. */
@Injectable()
export class AlertsScheduler implements OnModuleInit {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(
    @InjectQueue(ALERTS_FAST_QUEUE) private readonly fastQueue: Queue,
    @InjectQueue(ALERTS_DAILY_QUEUE) private readonly dailyQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.fastQueue.upsertJobScheduler("alerts-fast-repeat", { every: FAST_INTERVAL_MS }, { name: "evaluate" });
    await this.dailyQueue.upsertJobScheduler("alerts-daily-repeat", { every: DAILY_INTERVAL_MS }, { name: "evaluate" });
    // Immediate first run of each.
    await this.fastQueue.add("evaluate-now", {});
    await this.dailyQueue.add("evaluate-now", {});
    this.logger.log(`Alert queues scheduled: fast every ${FAST_INTERVAL_MS / 60000}min, daily every ${DAILY_INTERVAL_MS / 3600000}h.`);
  }
}
