import { Injectable, Logger } from "@nestjs/common";
import { LlmOrchestratorService } from "../ai/llm/llm-orchestrator.service";
import {
  StubExecutiveSummaryProvider,
  type ExecutiveSummaryInput,
  type ExecutiveSummaryProvider,
} from "./executive-summary.provider";

/**
 * The real Phase 19 implementation of the swappable interface
 * executive-summary.provider.ts's own docstring promised: "register a
 * different provider in ReportsModule ... not a rewrite of any report
 * template." Confirmed true — no PDF template file needed to change, only
 * reports.module.ts's provider binding.
 *
 * Every number in `input.headlineFacts` already comes from a real service
 * call upstream (ReportsService) — this class never computes or guesses a
 * figure, only asks the LLM to phrase the ones it's given. On any failure
 * (Claude unconfigured/failing AND Ollama also unreachable — the only way
 * LlmOrchestratorService.complete() itself throws), falls back to the exact
 * same honest placeholder StubExecutiveSummaryProvider already produced
 * throughout Phase 18, via delegation rather than duplicating that text —
 * so a total LLM outage degrades report generation to pre-Phase-19
 * behavior instead of breaking it.
 */
@Injectable()
export class LlmExecutiveSummaryProvider implements ExecutiveSummaryProvider {
  private readonly logger = new Logger(LlmExecutiveSummaryProvider.name);
  private readonly stub = new StubExecutiveSummaryProvider();

  constructor(private readonly orchestrator: LlmOrchestratorService) {}

  async generateSummary(input: ExecutiveSummaryInput): Promise<{ text: string; isPlaceholder: boolean }> {
    const facts = Object.entries(input.headlineFacts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    const prompt = `Write a short (2-3 sentence), factual, plain-English executive summary for a "${input.reportType.replace(/-/g, " ")}" financial report, using ONLY these real computed figures (do not invent, estimate, or round any number not present here):\n${facts}\n\nDo not add a greeting or sign-off, just the summary text.`;

    try {
      const result = await this.orchestrator.complete([{ role: "user", content: prompt }]);
      const text = result.text.trim();
      if (!text) throw new Error("LLM returned an empty executive summary");
      return { text, isPlaceholder: false };
    } catch (err) {
      this.logger.warn(`LLM executive summary failed for ${input.reportType}, falling back to placeholder: ${String(err)}`);
      return this.stub.generateSummary(input);
    }
  }
}
