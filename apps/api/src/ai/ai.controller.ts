import { Controller, Get, Post, Param, UseGuards, Request } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/guards/supabase-auth.guard";
import { IndexingService } from "./rag/indexing.service";
import { AiReportService } from "./reports/ai-report.service";
import type { AiReportType } from "@prisma/client";

interface AuthRequest {
  user: { id: string };
}

@Controller("ai")
@UseGuards(SupabaseAuthGuard)
export class AiController {
  constructor(
    private readonly indexing: IndexingService,
    private readonly reports: AiReportService,
  ) {}

  /** Manual reindex trigger — the scheduled path (evaluators reindexing on
   * their own cadence) doesn't exist yet in this phase; a user can index
   * on demand from the Chat page instead. See STATUS.md's scope notes. */
  @Post("reindex")
  reindex(@Request() req: AuthRequest) {
    return this.indexing.reindexUser(req.user.id);
  }

  @Get("reports")
  listReports(@Request() req: AuthRequest) {
    return this.reports.listReports(req.user.id);
  }

  @Get("reports/:type/latest")
  getLatestReport(@Request() req: AuthRequest, @Param("type") type: string) {
    return this.reports.getLatestReport(req.user.id, type.toUpperCase() as AiReportType);
  }

  /** Generate-now for a given report type (used for live demoing/testing —
   * the real path is the scheduler, but this lets a user or a test trigger
   * one without waiting for the next cron tick). */
  @Post("reports/:type/generate")
  generateReport(@Request() req: AuthRequest, @Param("type") type: string) {
    return this.reports.generateReport(req.user.id, type.toUpperCase() as AiReportType);
  }
}
