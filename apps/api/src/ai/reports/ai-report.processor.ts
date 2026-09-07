import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import { AiReportService } from "./ai-report.service";
import type { AiReportType } from "@prisma/client";

export const AI_REPORTS_QUEUE = "ai-reports";

@Processor(AI_REPORTS_QUEUE)
export class AiReportProcessor extends WorkerHost {
  private readonly logger = new Logger(AiReportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: AiReportService,
  ) {
    super();
  }

  async process(job: Job<{ type: AiReportType }>): Promise<void> {
    const { type } = job.data;
    const users = await this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } });
    let generated = 0;
    for (const { id: userId } of users) {
      try {
        await this.reports.generateReport(userId, type);
        generated++;
      } catch (err) {
        this.logger.warn(`Report generation failed for user ${userId} (${type}): ${String(err)}`);
      }
    }
    this.logger.log(`${type} AI report generation: ${generated}/${users.length} users.`);
  }
}
