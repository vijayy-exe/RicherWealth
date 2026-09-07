import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AiSourceType } from "@prisma/client";

export interface RetrievedChunk {
  sourceType: AiSourceType;
  sourceId: string;
  content: string;
  similarity: number; // 1 - cosine distance, so 1.0 = identical, 0 = orthogonal
}

/** Prisma has no native `vector` column type — every read/write against
 * `portfolio_embeddings.embedding` goes through raw SQL here, using
 * `Prisma.sql`'s parameterized template (not string concatenation) to stay
 * injection-safe. Nothing outside this file should touch that column. */
@Injectable()
export class EmbeddingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(",")}]`;
  }

  async upsert(params: {
    userId: string;
    sourceType: AiSourceType;
    sourceId: string;
    content: string;
    embedding: number[];
  }): Promise<void> {
    const vec = this.toVectorLiteral(params.embedding);
    const id = `pe_${params.userId}_${params.sourceType}_${params.sourceId}`.slice(0, 60) + Math.random().toString(36).slice(2, 8);
    await this.prisma.$executeRaw`
      INSERT INTO portfolio_embeddings (id, "userId", "sourceType", "sourceId", content, embedding, "updatedAt", "createdAt")
      VALUES (${id}, ${params.userId}, ${params.sourceType}::"AiSourceType", ${params.sourceId}, ${params.content}, ${vec}::vector, now(), now())
      ON CONFLICT ("userId", "sourceType", "sourceId")
      DO UPDATE SET content = ${params.content}, embedding = ${vec}::vector, "updatedAt" = now()
    `;
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.prisma.$executeRaw`DELETE FROM portfolio_embeddings WHERE "userId" = ${userId}`;
  }

  /** Top-K nearest chunks by cosine similarity, scoped to one user — the
   * actual grounding step: whatever comes back here is what the LLM is
   * allowed to treat as fact about this user's portfolio. */
  async search(userId: string, queryEmbedding: number[], topK = 8): Promise<RetrievedChunk[]> {
    const vec = this.toVectorLiteral(queryEmbedding);
    const rows = await this.prisma.$queryRaw<Array<{ sourceType: AiSourceType; sourceId: string; content: string; similarity: number }>>`
      SELECT "sourceType", "sourceId", content, 1 - (embedding <=> ${vec}::vector) AS similarity
      FROM portfolio_embeddings
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${topK}
    `;
    return rows;
  }

  async countForUser(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM portfolio_embeddings WHERE "userId" = ${userId}
    `;
    return Number(rows[0]?.count ?? 0);
  }
}

// Re-exported so callers don't need to reach into @prisma/client directly for this one enum.
export type { Prisma };
