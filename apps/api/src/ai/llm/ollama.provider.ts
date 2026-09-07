import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import type { LlmProvider, LlmMessage, LlmCompletionResult } from "./llm-provider.interface";

/**
 * The real, zero-cost fallback — and, in THIS dev environment specifically,
 * the only path that actually produces a live LLM response, since no
 * Claude/OpenAI key is configured. Ollama is confirmed already installed
 * and running locally (`ollama serve`, verified via `GET /api/tags`) with
 * a real model already pulled — `gemma4` (8B, Q4_K_M). That model, not
 * Llama 3 or Mistral as the user's brief suggested, is what's used here:
 * pulling a second multi-gigabyte model when a working one is already
 * present and running would be pure waste, and the interface doesn't care
 * which open model sits behind it.
 */
@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly name: string;
  private readonly logger = new Logger(OllamaProvider.name);
  private readonly baseUrl: string;
  private available: boolean | null = null; // lazily probed, cached

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434";
    this.name = `ollama:${this.config.get<string>("OLLAMA_CHAT_MODEL") ?? "gemma4"}`;
  }

  private get model(): string {
    return this.name.replace("ollama:", "");
  }

  isConfigured(): boolean {
    // Synchronous interface, async reality: report "possibly available"
    // and let complete()/streamComplete() surface a real failure if the
    // daemon actually turns out to be down — avoids a network round trip
    // just to answer a yes/no the orchestrator will verify by trying anyway.
    return true;
  }

  async complete(messages: LlmMessage[]): Promise<LlmCompletionResult> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/api/chat`,
        { model: this.model, messages, stream: false },
        { timeout: 60_000 },
      );
      const text = res.data?.message?.content ?? "";
      if (!text) throw new Error("Ollama returned an empty response");
      return { text, modelUsed: this.name };
    } catch (err) {
      this.logger.error(`Ollama completion failed: ${String(err)}`);
      throw err;
    }
  }

  async *streamComplete(messages: LlmMessage[]): AsyncIterable<string> {
    const res = await axios.post(
      `${this.baseUrl}/api/chat`,
      { model: this.model, messages, stream: true },
      { responseType: "stream", timeout: 60_000 },
    );
    let buffer = "";
    for await (const chunk of res.data as AsyncIterable<Buffer>) {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        if (parsed.message?.content) yield parsed.message.content;
      }
    }
  }
}
