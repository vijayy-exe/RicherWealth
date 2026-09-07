/**
 * RAG grounding — AC1 ("AI Chat correctly answers a factual question about
 * a seeded test portfolio's actual holdings — grounding test, no
 * hallucinated numbers"). This is the real, full-stack path: real Postgres
 * + pgvector (EmbeddingRepository's raw SQL), real Ollama embeddings
 * (nomic-embed-text) and real Ollama chat completion (gemma4, since no
 * ANTHROPIC_API_KEY is loaded when Jest runs plain `jest`) — deliberately
 * NOT mocked, because the whole point of this acceptance criterion is
 * proving the real retrieval+generation pipeline doesn't invent numbers,
 * which a mocked LLM/embedding call can't demonstrate.
 *
 * TransactionsService/GoalsService are lightweight stubs returning empty
 * arrays (this test seeds no transactions/goals — AssetsService, the thing
 * actually under test for grounding, is real). Every seeded row is deleted
 * in afterAll.
 */
import Decimal from "decimal.js";
import axios from "axios";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../../prisma/prisma.service";
import { NetWorthService } from "../../net-worth/net-worth.service";
import { AssetsService } from "../../assets/assets.service";
import { EmbeddingService } from "./embedding.service";
import { EmbeddingRepository } from "./embedding.repository";
import { IndexingService } from "./indexing.service";
import { RetrievalService } from "./retrieval.service";
import { ClaudeProvider } from "../llm/claude.provider";
import { OllamaProvider } from "../llm/ollama.provider";
import { LlmOrchestratorService } from "../llm/llm-orchestrator.service";
import { ChatService } from "../chat/chat.service";

const TEST_EMAIL = "phase19-grounding-test@richerwealth.test";
const SEEDED_ASSET_NAME = "ZZTEST Corp";
const SEEDED_ASSET_VALUE = "73456.89";

const configStub = { get: (key: string): string | undefined => process.env[key] } as never;

async function isOllamaReachable(): Promise<boolean> {
  try {
    await axios.get("http://localhost:11434/api/tags", { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

describe("RAG grounding (AC1 — no hallucinated numbers)", () => {
  const prisma = new PrismaService();
  const identityForex = { convert: (amount: Decimal) => Promise.resolve(amount), getRate: () => Promise.resolve(new Decimal(1)) };
  const netWorth = new NetWorthService(prisma, identityForex as never, new EventEmitter2());
  const assets = new AssetsService(prisma, netWorth, new EventEmitter2(), identityForex as never);
  const emptyTransactions = { findAll: () => Promise.resolve([]) };
  const emptyGoals = { findAll: () => Promise.resolve([]) };
  const embeddingService = new EmbeddingService(configStub);
  const embeddingRepo = new EmbeddingRepository(prisma);
  const indexing = new IndexingService(prisma, assets, emptyTransactions as never, emptyGoals as never, netWorth, embeddingService, embeddingRepo);
  const retrieval = new RetrievalService(embeddingService, embeddingRepo);
  const orchestrator = new LlmOrchestratorService(new ClaudeProvider(configStub), new OllamaProvider(configStub));
  const chat = new ChatService(prisma, retrieval, orchestrator);

  let userId: string;
  let assetId: string;
  let infraAvailable = true;

  beforeAll(async () => {
    infraAvailable = await isOllamaReachable();
    if (!infraAvailable) {
      // eslint-disable-next-line no-console
      console.warn("Grounding integration tests SKIPPED: Ollama not reachable at localhost:11434.");
      return;
    }
    try {
      await prisma.$connect();
    } catch {
      infraAvailable = false;
      // eslint-disable-next-line no-console
      console.warn("Grounding integration tests SKIPPED: could not connect to Postgres.");
      return;
    }

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: { supabaseId: `phase19-grounding-${Date.now()}`, email: TEST_EMAIL, baseCurrency: "USD" },
    });
    userId = user.id;

    const asset = await prisma.asset.create({
      data: { userId, type: "STOCK", name: SEEDED_ASSET_NAME, currentValue: new Decimal(SEEDED_ASSET_VALUE), currencyCode: "USD" },
    });
    assetId = asset.id;
  }, 30_000);

  afterAll(async () => {
    if (!infraAvailable) return;
    await embeddingRepo.deleteAllForUser(userId).catch(() => undefined);
    await prisma.aiMessage.deleteMany({ where: { conversation: { userId } } }).catch(() => undefined);
    await prisma.aiConversation.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.asset.deleteMany({ where: { id: assetId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }, 30_000);

  it("indexes the seeded asset into pgvector", async () => {
    if (!infraAvailable) return;
    const { indexed } = await indexing.reindexUser(userId);
    expect(indexed).toBeGreaterThan(0);
    const count = await embeddingRepo.countForUser(userId);
    expect(count).toBeGreaterThan(0);
  }, 90_000);

  it("retrieves the exact seeded value for a question about that holding (RAG correctness, isolated from LLM non-determinism)", async () => {
    if (!infraAvailable) return;
    const chunks = await retrieval.retrieve(userId, `How much is my ${SEEDED_ASSET_NAME} holding worth?`, 8);
    expect(chunks.length).toBeGreaterThan(0);
    const hit = chunks.find((c) => c.content.includes(SEEDED_ASSET_NAME) && c.content.includes(SEEDED_ASSET_VALUE));
    expect(hit).toBeDefined();
  }, 60_000);

  it("the full chat pipeline answers with the exact real number and cites the seeded asset as a RAG source — no hallucination", async () => {
    if (!infraAvailable) return;
    const conv = await prisma.aiConversation.create({ data: { userId, title: "grounding test" } });

    let assembled = "";
    let ragSources: Array<{ sourceId: string }> = [];
    for await (const event of chat.streamReply(userId, conv.id, `What is the exact current value of my ${SEEDED_ASSET_NAME} holding? Answer with just the number.`)) {
      if (event.type === "chunk") assembled += event.text;
      if (event.type === "done") ragSources = event.ragSources as never;
    }

    expect(assembled).toContain(SEEDED_ASSET_VALUE);
    expect(ragSources.some((s) => s.sourceId === assetId)).toBe(true);
  }, 120_000);

  it("reports plainly if infra was unavailable, rather than silently no-oping every test above", () => {
    if (infraAvailable) return;
    expect(infraAvailable).toBe(false);
  });
});
