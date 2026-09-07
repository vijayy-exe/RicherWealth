import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export const EMBEDDING_DIM = 768; // matches nomic-embed-text

/**
 * Embeddings run entirely through Ollama's local `nomic-embed-text` model
 * (confirmed pulled and working — 768-dim vectors verified against a real
 * request during this phase's build) — deliberately not Claude/OpenAI's
 * paid embedding APIs, since indexing a user's full asset/transaction/goal
 * history is a lot of rows to embed and there's no reason to spend paid
 * API budget on it when a genuinely good, free, local embedding model is
 * already available and running.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>("OLLAMA_BASE_URL") ?? "http://localhost:11434";
    this.model = this.config.get<string>("OLLAMA_EMBEDDING_MODEL") ?? "nomic-embed-text";
  }

  async embed(text: string): Promise<number[] | null> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/api/embeddings`,
        { model: this.model, prompt: text },
        // 60s, not a tighter value: a cold Ollama model load (this model
        // swapped out of memory after its keep-alive window, or never
        // loaded yet this run) genuinely took ~20s end-to-end in direct
        // testing, vs. ~0.2s once warm -- confirmed live via `curl` timing
        // during this phase's build. Matches OllamaProvider's own chat
        // timeout for the same reason.
        { timeout: 60_000 },
      );
      const embedding = res.data?.embedding as number[] | undefined;
      if (!embedding || embedding.length !== EMBEDDING_DIM) {
        this.logger.warn(`Unexpected embedding shape from Ollama (got ${embedding?.length ?? "none"}, expected ${EMBEDDING_DIM})`);
        return null;
      }
      return embedding;
    } catch (err) {
      this.logger.warn(`Embedding request failed (is Ollama running?): ${String(err)}`);
      return null;
    }
  }
}
