/**
 * OllamaProvider — Fix Audit B-05 ("no concurrency limit around local-LLM
 * calls"). The audit's own evidence: a boot-time report batch fired
 * `.complete()` back-to-back for 17 seeded users against a single-slot
 * local Ollama daemon, loaded two models at once, and hit a genuine
 * Metal/GPU OOM (305 consecutive "Ollama returned an empty response"
 * failures). The existing empty-response-to-template fallback caught every
 * one honestly; this test proves the actual fix -- that no more than 2
 * `.complete()` calls are ever in flight against the daemon at once,
 * regardless of how many callers ask for one simultaneously.
 *
 * axios is mocked so this is a fast, deterministic unit test, not a live
 * integration test against a real daemon.
 */
import axios from "axios";
import type { ConfigService } from "@nestjs/config";
import { OllamaProvider } from "./ollama.provider";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const configStub = { get: () => undefined } as unknown as ConfigService;

describe("OllamaProvider concurrency limit (B-05)", () => {
  it("never has more than 2 completions in flight against the daemon at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const pending: Array<() => void> = [];

    mockedAxios.post.mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        pending.push(() => {
          inFlight--;
          resolve({ data: { message: { content: "ok" } } });
        });
      });
    });

    const provider = new OllamaProvider(configStub);
    const calls = Array.from({ length: 5 }, () => provider.complete([{ role: "user", content: "hi" }]));

    // Let every call reach the limiter's queue.
    await new Promise((r) => setTimeout(r, 10));
    expect(inFlight).toBe(2); // concurrency 2, per the plan's fix step -- not all 5 at once
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);

    // Release queued requests one at a time; concurrency must never exceed 2.
    while (pending.length > 0) {
      pending.shift()?.();
      await new Promise((r) => setTimeout(r, 5));
      expect(inFlight).toBeLessThanOrEqual(2);
    }

    await Promise.all(calls);
    expect(mockedAxios.post).toHaveBeenCalledTimes(5); // all 5 eventually ran, just paced
    expect(maxInFlight).toBe(2);
  });
});
