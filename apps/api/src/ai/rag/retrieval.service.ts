import { Injectable, Logger } from "@nestjs/common";
import { EmbeddingService } from "./embedding.service";
import { EmbeddingRepository, type RetrievedChunk } from "./embedding.repository";

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly embedding: EmbeddingService,
    private readonly repo: EmbeddingRepository,
  ) {}

  /** Returns [] (not an exception) when embeddings are unavailable —
   * callers must treat empty context as "answer honestly that you don't
   * have grounded data," never as license to guess. */
  async retrieve(userId: string, query: string, topK = 8): Promise<RetrievedChunk[]> {
    const queryVector = await this.embedding.embed(query);
    if (!queryVector) {
      this.logger.warn("Could not embed query — retrieval unavailable this call.");
      return [];
    }
    return this.repo.search(userId, queryVector, topK);
  }
}
