import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmMessage, LlmCompletionResult } from "./llm-provider.interface";

const MODEL = "claude-sonnet-5";

/**
 * The "primary" path per the user's brief — but this dev environment has
 * no ANTHROPIC_API_KEY configured (confirmed: not in .env before this
 * phase), so `isConfigured()` returns false and LlmOrchestratorService
 * falls through to Ollama for every real request in this environment. The
 * code path itself is real and correct; whether it produces a live Claude
 * response is a function of whether a real key is ever added, exactly the
 * same honesty pattern as Resend/Firebase/FRED/NewsAPI elsewhere in this
 * app when their credentials are unset.
 */
@Injectable()
export class ClaudeProvider implements LlmProvider {
  readonly name = "claude-sonnet-5";
  private readonly logger = new Logger(ClaudeProvider.name);
  private readonly client: Anthropic | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("ANTHROPIC_API_KEY");
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn("ANTHROPIC_API_KEY not configured — Claude provider unavailable, orchestrator will fall back to Ollama.");
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async complete(messages: LlmMessage[]): Promise<LlmCompletionResult> {
    if (!this.client) throw new Error("Claude provider not configured");
    const { system, rest } = splitSystem(messages);
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      ...(system !== undefined && { system }),
      messages: rest.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { text, modelUsed: this.name };
  }

  async *streamComplete(messages: LlmMessage[]): AsyncIterable<string> {
    if (!this.client) throw new Error("Claude provider not configured");
    const { system, rest } = splitSystem(messages);
    const stream = this.client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      ...(system !== undefined && { system }),
      messages: rest.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }
}

function splitSystem(messages: LlmMessage[]): { system: string | undefined; rest: LlmMessage[] } {
  const systemMsg = messages.find((m) => m.role === "system");
  return { system: systemMsg?.content, rest: messages.filter((m) => m.role !== "system") };
}
