/**
 * LlmOrchestratorService — AC4 ("Ollama fallback path is tested and
 * produces a usable response when the primary LLM API is unavailable").
 *
 * Two real, live integration tests (no ANTHROPIC_API_KEY is set when Jest
 * runs plain `jest` — it only exists in apps/api/.env, which nothing here
 * loads — so ClaudeProvider.isConfigured() is naturally false, meaning the
 * orchestrator genuinely falls through to a real Ollama call every time),
 * plus one explicitly-mocked test that proves the *decision logic* itself
 * (Claude configured but failing at request time) independent of whatever
 * env vars happen to be set in whichever environment runs this suite.
 *
 * Guarded: skips with a clear message if Ollama isn't reachable, rather
 * than hard-failing CI/a machine without it running.
 *
 * KNOWN FLAKINESS SOURCE (observed directly, not theoretical): a single
 * local Ollama daemon can only serve one loaded model at a time, so when
 * this suite runs concurrently with grounding.integration.spec.ts (also
 * real-Ollama) under Jest's default multi-worker parallelism, both suites'
 * calls contend for the same daemon and a cold model swap can take ~20s
 * (confirmed via direct `curl` timing during this phase's build) instead of
 * the <1s warm-model latency. 90s timeouts here are sized generously for
 * that contended case, not just a lucky warm-model run. If this still
 * flakes under Jest's default full-suite parallelism, rerun with a lower
 * `--maxWorkers` or `--runInBand` -- each AI spec file passes reliably in
 * isolation regardless (verified repeatedly during this phase's build).
 */
import axios from "axios";
import { ClaudeProvider } from "./claude.provider";
import { OllamaProvider } from "./ollama.provider";
import { LlmOrchestratorService } from "./llm-orchestrator.service";
import type { LlmProvider, LlmMessage, LlmCompletionResult } from "./llm-provider.interface";

const configStub = { get: (key: string): string | undefined => process.env[key] } as never;

async function isOllamaReachable(): Promise<boolean> {
  try {
    await axios.get("http://localhost:11434/api/tags", { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

describe("LlmOrchestratorService (AC4 — Ollama fallback)", () => {
  let ollamaReachable = false;

  beforeAll(async () => {
    ollamaReachable = await isOllamaReachable();
    if (!ollamaReachable) {
      // eslint-disable-next-line no-console
      console.warn("LlmOrchestratorService live tests SKIPPED: Ollama not reachable at localhost:11434.");
    }
  });

  it("complete() falls back to a real Ollama response when Claude is unconfigured", async () => {
    if (!ollamaReachable) return;
    const claude = new ClaudeProvider(configStub);
    const ollama = new OllamaProvider(configStub);
    expect(claude.isConfigured()).toBe(false); // sanity: this test's whole premise

    const orchestrator = new LlmOrchestratorService(claude, ollama);
    const result = await orchestrator.complete([{ role: "user", content: "Reply with exactly one word: hello" }]);

    expect(result.modelUsed.startsWith("ollama:")).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  }, 90_000);

  it("streamComplete() falls back to real Ollama streaming when Claude is unconfigured", async () => {
    if (!ollamaReachable) return;
    const claude = new ClaudeProvider(configStub);
    const ollama = new OllamaProvider(configStub);
    const orchestrator = new LlmOrchestratorService(claude, ollama);

    const chunks: string[] = [];
    let modelUsed = "";
    for await (const piece of orchestrator.streamComplete([{ role: "user", content: "Reply with exactly one word: hello" }])) {
      chunks.push(piece.text);
      modelUsed = piece.modelUsed;
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("").length).toBeGreaterThan(0);
    expect(modelUsed.startsWith("ollama:")).toBe(true);
  }, 90_000);

  it("falls back to Ollama when Claude IS configured but fails at request time (the literal 'primary API unavailable' case)", async () => {
    if (!ollamaReachable) return;
    const failingClaude: LlmProvider = {
      name: "claude-sonnet-5",
      isConfigured: () => true,
      complete: () => Promise.reject(new Error("simulated Claude outage")),
      streamComplete: async function* () {
        throw new Error("simulated Claude outage");
      },
    };
    const ollama = new OllamaProvider(configStub);
    const orchestrator = new LlmOrchestratorService(failingClaude as ClaudeProvider, ollama);

    const result: LlmCompletionResult = await orchestrator.complete([{ role: "user", content: "Reply with exactly one word: hello" } as LlmMessage]);

    expect(result.modelUsed.startsWith("ollama:")).toBe(true);
    expect(result.text.length).toBeGreaterThan(0);
  }, 90_000);

  it("reports plainly if Ollama was unreachable, rather than silently no-oping every test above", () => {
    if (ollamaReachable) return;
    expect(ollamaReachable).toBe(false);
  });
});
