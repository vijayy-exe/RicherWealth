/**
 * ChatService unit tests — deterministic with mocked Prisma, RetrievalService,
 * LlmOrchestratorService and NetWorthService.
 *
 * Fix Audit B-02: diagnosed live against the real RAG pipeline (real
 * pgvector retrieval, a real indexed user, the real system prompt) and
 * confirmed the net-worth figure IS retrieved correctly — this is the
 * plan's "model-capability ceiling" branch, not a retrieval bug. The fix
 * is a rules-based short-circuit for purely factual net-worth/cash
 * questions that bypasses retrieval+LLM entirely and answers from
 * NetWorthService directly, since that data has exactly one authoritative
 * source and doesn't need an LLM to reason over unstructured context.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ChatService } from "./chat.service";
import { PrismaService } from "../../prisma/prisma.service";
import { RetrievalService } from "../rag/retrieval.service";
import { LlmOrchestratorService } from "../llm/llm-orchestrator.service";
import { NetWorthService, type DashboardSummary } from "../../net-worth/net-worth.service";

const mockPrisma = {
  aiMessage: { create: jest.fn(), findMany: jest.fn() },
  aiConversation: { findUnique: jest.fn(), update: jest.fn() },
};

const mockRetrieval = { retrieve: jest.fn() };
const mockOrchestrator = { streamComplete: jest.fn() };
const mockNetWorth = { getDashboardSummary: jest.fn() };

const CONVERSATION_ID = "conv-1";
const USER_ID = "user-1";

function summaryWith(overrides: Partial<DashboardSummary>): DashboardSummary {
  return {
    totalNetWorth: 6_800_000,
    todayChangeAbs: 0,
    todayChangePct: 0,
    monthChangeAbs: 0,
    monthChangePct: 0,
    yearChangeAbs: 0,
    yearChangePct: 0,
    assetAllocation: [{ category: "CASH", valueInBase: 800_000, percentage: 11 }],
    currencyExposure: [],
    emergencyFundHealth: 12,
    debtRatio: 0.068,
    snapshots: [],
    hasAssets: true,
    baseCurrency: "INR",
    ...overrides,
  };
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("ChatService", () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.aiMessage.create.mockResolvedValue({});
    mockPrisma.aiMessage.findMany.mockResolvedValue([]);
    mockPrisma.aiConversation.findUnique.mockResolvedValue({ title: "New chat" });
    mockPrisma.aiConversation.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RetrievalService, useValue: mockRetrieval },
        { provide: LlmOrchestratorService, useValue: mockOrchestrator },
        { provide: NetWorthService, useValue: mockNetWorth },
      ],
    }).compile();

    service = module.get(ChatService);
  });

  describe("factual short-circuit (B-02)", () => {
    it("answers a net-worth question directly from NetWorthService, bypassing retrieval and the LLM", async () => {
      mockNetWorth.getDashboardSummary.mockResolvedValue(summaryWith({ totalNetWorth: 6_800_000, baseCurrency: "INR" }));

      const events = await collect(service.streamReply(USER_ID, CONVERSATION_ID, "What is my current net worth?"));

      expect(mockRetrieval.retrieve).not.toHaveBeenCalled();
      expect(mockOrchestrator.streamComplete).not.toHaveBeenCalled();
      expect(mockNetWorth.getDashboardSummary).toHaveBeenCalledWith(USER_ID);

      const chunk = events.find((e) => e.type === "chunk");
      const done = events.find((e) => e.type === "done");
      expect(chunk?.text).toBe("Your current net worth is 6800000.00 INR.");
      expect(done).toMatchObject({ modelUsed: "rules-engine:net-worth-lookup", ragSources: [] });
    });

    it("answers a cash-balance question directly from NetWorthService's asset allocation", async () => {
      mockNetWorth.getDashboardSummary.mockResolvedValue(
        summaryWith({ assetAllocation: [{ category: "CASH", valueInBase: 2_607.5, percentage: 100 }], baseCurrency: "USD" }),
      );

      const events = await collect(service.streamReply(USER_ID, CONVERSATION_ID, "What's my cash balance?"));

      expect(mockRetrieval.retrieve).not.toHaveBeenCalled();
      expect(mockOrchestrator.streamComplete).not.toHaveBeenCalled();
      const chunk = events.find((e) => e.type === "chunk");
      expect(chunk?.text).toBe("Your current cash balance is 2607.50 USD.");
    });

    it("still falls through to retrieval+LLM for a non-factual question", async () => {
      mockRetrieval.retrieve.mockResolvedValue([]);
      mockOrchestrator.streamComplete.mockImplementation(async function* () {
        yield { text: "Your portfolio is diversified across stocks and insurance.", modelUsed: "ollama:qwen2.5:7b" };
      });

      await collect(service.streamReply(USER_ID, CONVERSATION_ID, "How is my portfolio diversified?"));

      expect(mockNetWorth.getDashboardSummary).not.toHaveBeenCalled();
      expect(mockRetrieval.retrieve).toHaveBeenCalledWith(USER_ID, "How is my portfolio diversified?", 8);
      expect(mockOrchestrator.streamComplete).toHaveBeenCalled();
    });
  });

  describe("empty-stream fallback", () => {
    it("persists and surfaces a clear fallback message instead of an empty one when the LLM stream yields no content", async () => {
      // Reproduces what was observed live on this machine: Ollama can
      // silently stream zero content chunks (host memory pressure) without
      // ever throwing — previously this persisted an empty assistant
      // message with no indication anything went wrong.
      mockRetrieval.retrieve.mockResolvedValue([]);
      mockOrchestrator.streamComplete.mockImplementation(async function* () {
        // yields nothing
      });

      const events = await collect(service.streamReply(USER_ID, CONVERSATION_ID, "What do you think about my portfolio?"));

      const chunkTexts = events.filter((e) => e.type === "chunk").map((e) => (e as { text: string }).text);
      expect(chunkTexts).toContain("I couldn't generate a response just now. Please try again in a moment.");

      const persistedCall = mockPrisma.aiMessage.create.mock.calls.find(([arg]) => arg.data.role === "ASSISTANT");
      expect(persistedCall?.[0].data.content).toBe("I couldn't generate a response just now. Please try again in a moment.");
    });
  });
});
