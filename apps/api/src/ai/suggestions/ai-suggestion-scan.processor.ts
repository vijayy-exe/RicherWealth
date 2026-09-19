import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { SuggestionEngineService } from "./suggestion-engine.service";

export const AI_SUGGESTION_SCAN_QUEUE = "ai-suggestion-scan";

/**
 * Phase 20 — AI CFO / Copilot background scan. Mirrors AiReportProcessor
 * (Phase 19) verbatim: per-user loop over the existing
 * `SuggestionEngineService.generateForUser` (already idempotent — dedupes
 * on `(userId, dedupeKey)` — so re-running this on a schedule can never
 * duplicate a card), catching per-user errors so one user's failure never
 * blocks the rest of the batch.
 */
@Processor(AI_SUGGESTION_SCAN_QUEUE)
export class AiSuggestionScanProcessor extends WorkerHost {
  private readonly logger = new Logger(AiSuggestionScanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suggestions: SuggestionEngineService,
  ) {
    super();
  }

  async process(_job: Job<Record<string, never>>): Promise<void> {
    const users = await this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } });
    let created = 0;
    for (const { id: userId } of users) {
      try {
        const result = await this.suggestions.generateForUser(userId);
        created += result.created;
      } catch (err) {
        this.logger.warn(`AI suggestion scan failed for user ${userId}: ${String(err)}`);
      }
    }
    this.logger.log(`AI suggestion scan: ${created} new suggestion(s) across ${users.length} users.`);
  }
}
