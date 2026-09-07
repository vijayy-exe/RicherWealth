/**
 * LlmExecutiveSummaryProvider — proves Phase 18's report generation never
 * breaks regardless of the AI layer's health: success path returns a real
 * LLM-authored summary, failure path (LLM totally unreachable) falls back
 * to the exact honest placeholder Phase 18 always used.
 */
import { LlmExecutiveSummaryProvider } from "./llm-executive-summary.provider";

describe("LlmExecutiveSummaryProvider", () => {
  const mockOrchestrator = { complete: jest.fn(), streamComplete: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it("returns a real, non-placeholder summary when the LLM succeeds", async () => {
    mockOrchestrator.complete.mockResolvedValue({ text: "Your net worth grew steadily this month.", modelUsed: "mock" });
    const provider = new LlmExecutiveSummaryProvider(mockOrchestrator as never);

    const result = await provider.generateSummary({ reportType: "net-worth-statement", headlineFacts: { netWorth: 100000 } });

    expect(result.isPlaceholder).toBe(false);
    expect(result.text).toBe("Your net worth grew steadily this month.");
  });

  it("falls back to the honest placeholder (never crashes report generation) when the LLM is completely unreachable", async () => {
    mockOrchestrator.complete.mockRejectedValue(new Error("both Claude and Ollama down"));
    const provider = new LlmExecutiveSummaryProvider(mockOrchestrator as never);

    const result = await provider.generateSummary({ reportType: "tax-report", headlineFacts: { totalGains: 5000 } });

    expect(result.isPlaceholder).toBe(true);
    expect(result.text).toContain("totalGains: 5000");
  });

  it("also falls back to the placeholder when the LLM returns an empty string", async () => {
    mockOrchestrator.complete.mockResolvedValue({ text: "   ", modelUsed: "mock" });
    const provider = new LlmExecutiveSummaryProvider(mockOrchestrator as never);

    const result = await provider.generateSummary({ reportType: "financial-snapshot", headlineFacts: { a: 1 } });

    expect(result.isPlaceholder).toBe(true);
  });
});
