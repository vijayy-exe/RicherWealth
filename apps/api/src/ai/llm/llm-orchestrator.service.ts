import { Injectable, Logger } from "@nestjs/common";
import { ClaudeProvider } from "./claude.provider";
import { OllamaProvider } from "./ollama.provider";
import type { LlmMessage, LlmCompletionResult } from "./llm-provider.interface";

/**
 * The one place that decides Claude-vs-Ollama. Tries the configured
 * primary (Claude) first; on any failure — not configured, network error,
 * rate limit — falls back to Ollama and returns its answer with
 * `modelUsed` honestly reflecting which one actually ran. A caller that
 * cares (chat, reports, suggestions) should always surface `modelUsed` to
 * the user rather than presenting every answer as if it came from the
 * same, best model.
 */
@Injectable()
export class LlmOrchestratorService {
  private readonly logger = new Logger(LlmOrchestratorService.name);

  constructor(
    private readonly claude: ClaudeProvider,
    private readonly ollama: OllamaProvider,
  ) {}

  async complete(messages: LlmMessage[]): Promise<LlmCompletionResult> {
    if (this.claude.isConfigured()) {
      try {
        return await this.claude.complete(messages);
      } catch (err) {
        this.logger.warn(`Claude failed, falling back to Ollama: ${String(err)}`);
      }
    }
    return this.ollama.complete(messages);
  }

  async *streamComplete(messages: LlmMessage[]): AsyncGenerator<{ text: string; modelUsed: string }> {
    if (this.claude.isConfigured()) {
      try {
        let any = false;
        for await (const chunk of this.claude.streamComplete(messages)) {
          any = true;
          yield { text: chunk, modelUsed: this.claude.name };
        }
        if (any) return;
      } catch (err) {
        this.logger.warn(`Claude streaming failed, falling back to Ollama: ${String(err)}`);
      }
    }
    for await (const chunk of this.ollama.streamComplete(messages)) {
      yield { text: chunk, modelUsed: this.ollama.name };
    }
  }
}
