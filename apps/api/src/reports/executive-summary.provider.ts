import { Injectable } from "@nestjs/common";

/**
 * Phase 19 (the AI layer) now exists (see LlmExecutiveSummaryProvider,
 * bound in ReportsModule) and is the real implementation used at runtime.
 * This stub remains as: (a) LlmExecutiveSummaryProvider's own fallback when
 * the LLM layer is completely unreachable (both Claude and Ollama down),
 * delegated to rather than duplicated, and (b) a directly-testable minimal
 * implementation of the interface in its own right. Every report template
 * calls the interface for its executive-summary paragraph rather than
 * embedding one directly, which is exactly what made the LLM-backed swap a
 * one-file change (reports.module.ts's provider binding) — confirmed true,
 * no PDF template file needed to change.
 */
export interface ExecutiveSummaryInput {
  reportType: "net-worth-statement" | "portfolio-analytics" | "tax-report" | "financial-snapshot";
  headlineFacts: Record<string, string | number>;
}

export interface ExecutiveSummaryProvider {
  generateSummary(input: ExecutiveSummaryInput): Promise<{ text: string; isPlaceholder: boolean }>;
}

export const EXECUTIVE_SUMMARY_PROVIDER = Symbol("EXECUTIVE_SUMMARY_PROVIDER");

/**
 * The only implementation that exists today. Returns a clearly-labeled
 * placeholder built from the report's own already-computed headline facts
 * (never a hardcoded paragraph dressed up to look AI-written, and never an
 * actual LLM call this repo isn't set up to make yet).
 */
@Injectable()
export class StubExecutiveSummaryProvider implements ExecutiveSummaryProvider {
  async generateSummary(input: ExecutiveSummaryInput): Promise<{ text: string; isPlaceholder: boolean }> {
    const facts = Object.entries(input.headlineFacts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return Promise.resolve({
      text: `An AI-written narrative summary could not be generated for this ${input.reportType.replace(/-/g, " ")} right now (the AI layer is unreachable). The key figures behind this report are: ${facts}.`,
      isPlaceholder: true,
    });
  }
}
