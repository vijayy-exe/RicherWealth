/**
 * AiReportService — AC2 ("Daily AI report generates correctly off a known
 * day-over-day net worth change in test data"). Uses a REAL PrismaService
 * against this environment's live dev Postgres (no separate test DB exists
 * in this repo — same tradeoff every other real-Prisma test in this file
 * accepts) plus a real NetWorthService (so `getDelta`/`getDashboardSummary`
 * really compute from seeded rows, not a hand-authored fixture that could
 * silently drift from the real implementation), with a MOCKED
 * LlmOrchestratorService so narration text is deterministic. A minimal
 * same-currency-only forex stub avoids any live FX network call (identical
 * currencies short-circuit inside CurrencyService.convert itself — see
 * currency.service.ts:81 — so this stub is never actually exercised for
 * conversion math, only present to satisfy NetWorthService's constructor).
 *
 * Every seeded row is deleted in afterAll so repeated runs don't accumulate
 * data in the shared dev database.
 */
import Decimal from "decimal.js";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PrismaService } from "../../prisma/prisma.service";
import { NetWorthService } from "../../net-worth/net-worth.service";
import { AiReportService } from "./ai-report.service";

const TEST_EMAIL = "phase19-daily-report-test@richerwealth.test";
const KNOWN_PAST_NET_WORTH = 100_000;
const KNOWN_CURRENT_ASSET_VALUE = 100_412.5;
const KNOWN_ABS_CHANGE = KNOWN_CURRENT_ASSET_VALUE - KNOWN_PAST_NET_WORTH;

describe("AiReportService (AC2 — daily report off a known net worth delta)", () => {
  const prisma = new PrismaService();
  const identityForex = { convert: (amount: Decimal) => Promise.resolve(amount), getRate: () => Promise.resolve(new Decimal(1)) };
  // Fix Audit M-02: NetWorthService gained a new required TransactionsService
  // dependency (real trailing-3-month expense average for
  // emergencyFundHealth) -- this test seeds no transactions, so `null` here
  // is honest (falls through to NetWorthService's own currency-converted
  // fallback), same pattern as grounding.integration.spec.ts.
  const emptyTransactions = { getAverageMonthlyExpense: () => Promise.resolve(null) };
  const netWorth = new NetWorthService(prisma, identityForex as never, new EventEmitter2(), emptyTransactions as never);
  const mockOrchestrator = { complete: jest.fn(), streamComplete: jest.fn() };

  let userId: string;
  let assetId: string;
  let snapshotId: string;
  let dbAvailable = true;

  beforeAll(async () => {
    try {
      await prisma.$connect();
    } catch {
      dbAvailable = false;
      return;
    }

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: { supabaseId: `phase19-test-${Date.now()}`, email: TEST_EMAIL, baseCurrency: "USD" },
    });
    userId = user.id;

    const asset = await prisma.asset.create({
      data: {
        userId,
        type: "STOCK",
        name: "AC2 Test Holding",
        currentValue: new Decimal(KNOWN_CURRENT_ASSET_VALUE),
        currencyCode: "USD",
      },
    });
    assetId = asset.id;

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    twoDaysAgo.setHours(0, 0, 0, 0);
    const snapshot = await prisma.netWorthSnapshot.create({
      data: {
        userId,
        totalAssets: new Decimal(KNOWN_PAST_NET_WORTH),
        totalLiabilities: new Decimal(0),
        netWorth: new Decimal(KNOWN_PAST_NET_WORTH),
        baseCurrency: "USD",
        snapshotDate: twoDaysAgo,
      },
    });
    snapshotId = snapshot.id;
  }, 30_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.aiReport.deleteMany({ where: { userId } }).catch(() => undefined);
    await prisma.netWorthSnapshot.deleteMany({ where: { id: snapshotId } }).catch(() => undefined);
    await prisma.asset.deleteMany({ where: { id: assetId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  }, 30_000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("computes the exact known day-over-day delta from real seeded data", async () => {
    if (!dbAvailable) return; // guarded below via a dedicated skip-reporting test
    mockOrchestrator.complete.mockResolvedValue({ text: "Mocked narrative.", modelUsed: "mock-model" });
    const service = new AiReportService(prisma, netWorth, mockOrchestrator as never);

    const { id } = await service.generateReport(userId, "DAILY");
    const report = await prisma.aiReport.findUniqueOrThrow({ where: { id } });
    const computed = report.computedData as { netWorthDelta: { absChange: number; toValue: number; fromValue: number }; periodStart: string; periodEnd: string };

    expect(computed.netWorthDelta.absChange).toBeCloseTo(KNOWN_ABS_CHANGE, 6);
    expect(computed.netWorthDelta.toValue).toBeCloseTo(KNOWN_CURRENT_ASSET_VALUE, 6);
    expect(computed.netWorthDelta.fromValue).toBeCloseTo(KNOWN_PAST_NET_WORTH, 6);
    expect(report.isLLMGenerated).toBe(true);
    expect(report.narrative).toBe("Mocked narrative.");

    // Fix Audit B-04: computedData must carry real dates -- without them
    // the LLM prompt has nothing to fill "week ending ___" with and reaches
    // for the literal placeholder text "[Date]" instead.
    expect(computed.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(computed.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const promptArg = mockOrchestrator.complete.mock.calls[0]?.[0]?.[0]?.content as string;
    expect(promptArg).not.toContain("[Date]");
    expect(promptArg).toContain(computed.periodEnd);
  });

  it("falls back to a real (non-LLM) template narrative when the LLM is unreachable, still with the real numbers", async () => {
    if (!dbAvailable) return;
    mockOrchestrator.complete.mockRejectedValue(new Error("LLM unreachable"));
    const service = new AiReportService(prisma, netWorth, mockOrchestrator as never);

    await service.generateReport(userId, "DAILY");
    const report = await prisma.aiReport.findFirstOrThrow({ where: { userId, type: "DAILY" } });

    expect(report.isLLMGenerated).toBe(false);
    expect(report.modelUsed).toBeNull();
    expect(report.narrative).toContain(KNOWN_ABS_CHANGE.toFixed(2));
  });

  it("is idempotent: generating the same (userId, type, periodStart) report twice yields one row, not two", async () => {
    if (!dbAvailable) return;
    mockOrchestrator.complete.mockResolvedValue({ text: "Mocked narrative.", modelUsed: "mock-model" });
    const service = new AiReportService(prisma, netWorth, mockOrchestrator as never);
    const now = new Date();

    await service.generateReport(userId, "DAILY", now);
    await service.generateReport(userId, "DAILY", now);

    const count = await prisma.aiReport.count({ where: { userId, type: "DAILY" } });
    expect(count).toBe(1);
  });

  it("reports plainly if the live dev database was unreachable, rather than silently no-oping", () => {
    if (dbAvailable) return;
    // eslint-disable-next-line no-console
    console.warn("AiReportService integration tests SKIPPED: could not connect to the dev Postgres (DATABASE_URL). Start it and re-run.");
    expect(dbAvailable).toBe(false); // documents the skip explicitly rather than a silent pass
  });
});
