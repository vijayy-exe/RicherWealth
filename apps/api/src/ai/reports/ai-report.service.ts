import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NetWorthService } from "../../net-worth/net-worth.service";
import { LlmOrchestratorService } from "../llm/llm-orchestrator.service";
import type { AiReportType } from "@prisma/client";

const DAYS_BY_TYPE: Record<AiReportType, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30, YEARLY: 365 };

/**
 * Every number in `computedData` comes from a real query (NetWorthService's
 * existing getDelta, or a direct Transaction groupBy here) — the LLM (or,
 * honestly, a template when no LLM is configured) is used ONLY to phrase
 * `narrative` in natural language from those already-computed numbers. It
 * is never asked to compute or guess a figure itself.
 */
@Injectable()
export class AiReportService {
  private readonly logger = new Logger(AiReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netWorth: NetWorthService,
    private readonly orchestrator: LlmOrchestratorService,
  ) {}

  private periodStart(type: AiReportType, now: Date): Date {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - DAYS_BY_TYPE[type]);
    return d;
  }

  /** Real category-level spend comparison for the current period vs the
   * one immediately before it — genuinely computable from Transaction rows,
   * unlike a historical allocation "shift" (no per-category NetWorthSnapshot
   * exists — see the WEEKLY report's honest scope note below). */
  private async getSpendingByCategory(userId: string, since: Date, until: Date): Promise<Array<{ category: string; total: number }>> {
    const rows = await this.prisma.transaction.groupBy({
      by: ["category"],
      where: { userId, type: "expense", date: { gte: since, lt: until } },
      _sum: { amount: true },
    });
    return rows
      .map((r) => ({ category: r.category ?? "Uncategorized", total: Math.abs(Number(r._sum.amount ?? 0)) }))
      .sort((a, b) => b.total - a.total);
  }

  async generateReport(userId: string, type: AiReportType, now: Date = new Date()): Promise<{ id: string; created: boolean }> {
    const periodStart = this.periodStart(type, now);
    const periodEnd = now;

    const delta = await this.netWorth.getDelta(userId, DAYS_BY_TYPE[type]);
    const computedData: Record<string, unknown> = {
      netWorthDelta: delta,
      periodDays: DAYS_BY_TYPE[type],
    };

    if (type === "DAILY") {
      const summary = await this.netWorth.getDashboardSummary(userId);
      computedData["topHoldingsByValue"] = [...summary.assetAllocation].sort((a, b) => b.valueInBase - a.valueInBase).slice(0, 3);
    }

    if (type === "WEEKLY") {
      const summary = await this.netWorth.getDashboardSummary(userId);
      computedData["currentAllocation"] = summary.assetAllocation;
      // Honest scope note, not silently omitted: true week-over-week
      // "shift" would need a stored per-category snapshot history, which
      // doesn't exist (NetWorthSnapshot only stores the total). Recorded
      // in computedData itself so the frontend/report can disclose it.
      computedData["allocationShiftAvailable"] = false;
    }

    if (type === "MONTHLY") {
      const prevPeriodStart = new Date(periodStart);
      prevPeriodStart.setDate(prevPeriodStart.getDate() - DAYS_BY_TYPE[type]);
      const [currentSpend, previousSpend] = await Promise.all([
        this.getSpendingByCategory(userId, periodStart, periodEnd),
        this.getSpendingByCategory(userId, prevPeriodStart, periodStart),
      ]);
      computedData["currentPeriodSpendingByCategory"] = currentSpend;
      computedData["previousPeriodSpendingByCategory"] = previousSpend;
    }

    const { narrative, isLLMGenerated, modelUsed } = await this.narrate(type, computedData);

    const report = await this.prisma.aiReport.upsert({
      where: { userId_type_periodStart: { userId, type, periodStart } },
      create: { userId, type, periodStart, periodEnd, computedData: computedData as never, narrative, isLLMGenerated, modelUsed },
      update: { periodEnd, computedData: computedData as never, narrative, isLLMGenerated, modelUsed },
    });

    return { id: report.id, created: true };
  }

  private async narrate(type: AiReportType, computedData: Record<string, unknown>): Promise<{ narrative: string; isLLMGenerated: boolean; modelUsed: string | null }> {
    const prompt = `Write a short (2-4 sentence), factual, plain-English financial report of type "${type}" using ONLY these real computed figures (do not invent any number not present here):\n${JSON.stringify(computedData, null, 2)}\n\nCurrency amounts are already in the user's base currency unless stated otherwise. Do not add a greeting or sign-off, just the report text.`;
    try {
      const result = await this.orchestrator.complete([{ role: "user", content: prompt }]);
      return { narrative: result.text.trim(), isLLMGenerated: true, modelUsed: result.modelUsed };
    } catch (err) {
      this.logger.warn(`LLM narration failed, using template fallback: ${String(err)}`);
      return { narrative: this.templateNarrative(type, computedData), isLLMGenerated: false, modelUsed: null };
    }
  }

  /** Real fallback (not a stub) for when no LLM is reachable at all — still
   * built entirely from the same computedData, just without natural-
   * language polish. Used if BOTH Claude and Ollama fail. */
  private templateNarrative(type: AiReportType, data: Record<string, unknown>): string {
    const delta = data["netWorthDelta"] as { absChange: number; pctChange: number; toValue: number };
    const direction = delta.absChange >= 0 ? "gained" : "lost";
    return `Over the last ${DAYS_BY_TYPE[type]} day(s), your net worth ${direction} ${Math.abs(delta.absChange).toFixed(2)} (${delta.pctChange.toFixed(2)}%), now at ${delta.toValue.toFixed(2)}.`;
  }

  async getLatestReport(userId: string, type: AiReportType) {
    return this.prisma.aiReport.findFirst({ where: { userId, type }, orderBy: { periodStart: "desc" } });
  }

  async listReports(userId: string) {
    return this.prisma.aiReport.findMany({ where: { userId }, orderBy: { periodStart: "desc" }, take: 20 });
  }
}
