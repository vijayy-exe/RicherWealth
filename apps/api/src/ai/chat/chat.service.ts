import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RetrievalService } from "../rag/retrieval.service";
import { LlmOrchestratorService } from "../llm/llm-orchestrator.service";
import { NetWorthService, type DashboardSummary } from "../../net-worth/net-worth.service";
import type { LlmMessage } from "../llm/llm-provider.interface";
import type { RetrievedChunk } from "../rag/embedding.repository";

// Fix Audit B-02: diagnosed live against the real RAG pipeline (real
// pgvector retrieval, real indexed data, real system prompt) — confirmed
// the net-worth figure IS retrieved correctly (top chunk, 64% relevance),
// so this is the plan's second branch ("model-capability ceiling"), not a
// retrieval bug. Per the plan's own reasoning, a purely factual question
// with one authoritative source ("what is my net worth") doesn't need an
// LLM to reason over unstructured context at all — route it straight to
// NetWorthService and skip retrieval+LLM entirely, so the answer is exact
// and doesn't depend on any particular model's instruction-following.
const FACTUAL_QUERY_MATCHERS: Array<{ test: RegExp; answer: (s: DashboardSummary) => string }> = [
  {
    test: /\bnet[\s-]?worth\b/i,
    answer: (s) => `Your current net worth is ${s.totalNetWorth.toFixed(2)} ${s.baseCurrency}.`,
  },
  {
    test: /\bcash\s*(balance|value|holdings?|position)\b|\bhow much cash\b/i,
    answer: (s) => {
      const cash = s.assetAllocation.find((a) => a.category === "CASH")?.valueInBase ?? 0;
      return `Your current cash balance is ${cash.toFixed(2)} ${s.baseCurrency}.`;
    },
  },
];

const SYSTEM_PROMPT = `You are the RicherWealth AI Analyst, built into a personal wealth management app.

You will be given "PORTFOLIO CONTEXT" — real, current data retrieved from this specific user's own holdings, transactions, and goals. Treat it as ground truth.

Rules:
- For questions about the user's own portfolio (holdings, net worth, allocation, goals), answer ONLY using the PORTFOLIO CONTEXT provided. If the context doesn't contain the answer, say so plainly ("I don't have that in your indexed data yet") — never invent a number.
- For general finance/market questions not about this user's specific portfolio (e.g. comparing two companies, explaining a concept), you may use your own knowledge. Say when you're doing this so the user can tell the difference.
- Be concise. This is a finance app, not a chat toy — get to the point.
- Never give personalized investment/legal/tax advice framed as certainty; frame suggestions as things to consider, not instructions.`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly orchestrator: LlmOrchestratorService,
    private readonly netWorth: NetWorthService,
  ) {}

  async getOrCreateConversation(userId: string, conversationId?: string): Promise<string> {
    if (conversationId) {
      const existing = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, userId } });
      if (existing) return existing.id;
    }
    const created = await this.prisma.aiConversation.create({ data: { userId, title: "New chat" } });
    return created.id;
  }

  async listConversations(userId: string) {
    return this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  async getMessages(userId: string, conversationId: string) {
    const conv = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, userId } });
    if (!conv) return [];
    return this.prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
  }

  private buildContextBlock(chunks: RetrievedChunk[]): string {
    if (chunks.length === 0) return "PORTFOLIO CONTEXT: (none retrieved — the user's data may not be indexed yet, or nothing matched this question)";
    const lines = chunks.map((c, i) => `[${i + 1}] (${c.sourceType}, relevance ${(c.similarity * 100).toFixed(0)}%) ${c.content}`);
    return `PORTFOLIO CONTEXT (retrieved from this user's real data, most relevant first):\n${lines.join("\n")}`;
  }

  /** Streams {text} chunks, then a final {done: true, modelUsed, ragSources}
   * marker — the controller turns this into SSE events. Persists both the
   * user turn and the assembled assistant turn once streaming completes. */
  async *streamReply(userId: string, conversationId: string, userMessage: string): AsyncGenerator<
    { type: "chunk"; text: string } | { type: "done"; modelUsed: string; ragSources: RetrievedChunk[] }
  > {
    await this.prisma.aiMessage.create({
      data: { conversationId, role: "USER", content: userMessage },
    });

    const factualMatch = FACTUAL_QUERY_MATCHERS.find((m) => m.test.test(userMessage));
    if (factualMatch) {
      const summary = await this.netWorth.getDashboardSummary(userId);
      const answer = factualMatch.answer(summary);
      yield { type: "chunk", text: answer };
      await this.persistReply(conversationId, answer, "rules-engine:net-worth-lookup", []);
      await this.titleIfNew(conversationId, userMessage);
      yield { type: "done", modelUsed: "rules-engine:net-worth-lookup", ragSources: [] };
      return;
    }

    const ragChunks = await this.retrieval.retrieve(userId, userMessage, 8);
    const history = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 20, // recent context window, not the whole history forever
    });

    const messages: LlmMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${this.buildContextBlock(ragChunks)}` },
      ...history.map((m) => ({ role: m.role.toLowerCase() as "user" | "assistant", content: m.content })),
    ];

    let assembled = "";
    let modelUsed = "unknown";
    for await (const piece of this.orchestrator.streamComplete(messages)) {
      assembled += piece.text;
      modelUsed = piece.modelUsed;
      yield { type: "chunk", text: piece.text };
    }

    // The local Ollama fallback can silently stream zero content chunks
    // (e.g. under host memory pressure) without ever throwing — observed
    // live while diagnosing B-02. Persisting an empty assistant message in
    // that case looks like a failed send (the exact B-03 symptom) rather
    // than a model failure, so surface it honestly instead.
    if (!assembled) {
      assembled = "I couldn't generate a response just now. Please try again in a moment.";
      yield { type: "chunk", text: assembled };
    }

    await this.persistReply(conversationId, assembled, modelUsed, ragChunks);
    await this.titleIfNew(conversationId, userMessage);

    yield { type: "done", modelUsed, ragSources: ragChunks };
  }

  private async persistReply(conversationId: string, content: string, modelUsed: string, ragSources: RetrievedChunk[]): Promise<void> {
    await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content,
        modelUsed,
        ragSources: ragSources.map((c) => ({ sourceType: c.sourceType, sourceId: c.sourceId, similarity: c.similarity })) as never,
      },
    });
  }

  private async titleIfNew(conversationId: string, userMessage: string): Promise<void> {
    const conv = await this.prisma.aiConversation.findUnique({ where: { id: conversationId } });
    if (conv?.title === "New chat") {
      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: { title: userMessage.slice(0, 60) },
      });
    }
  }
}
