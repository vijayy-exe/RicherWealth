/**
 * WealthDnaService orchestration tests — deterministic with mocked
 * RiskEngineService, IncomeService, TransactionsService, GoalsService,
 * LlmOrchestratorService, and Prisma. The classification math itself is
 * covered independently and exactly in wealth-dna-classifier.spec.ts; this
 * file verifies the ASSEMBLY layer wires real-shaped upstream data into
 * that classifier correctly, the LLM-narrates/never-decides discipline
 * (with template fallback), and the get-cached-vs-recompute behavior.
 */
import { WealthDnaService } from "./wealth-dna.service";

describe("WealthDnaService", () => {
  const mockPrisma = { wealthDnaProfile: { findUnique: jest.fn(), upsert: jest.fn() } };
  const mockRiskEngine = { getRiskProfile: jest.fn() };
  const mockIncome = { getMonthlyPassiveIncome: jest.fn() };
  const mockTransactions = { getAverageMonthlyExpense: jest.fn() };
  const mockGoals = { findAll: jest.fn(), getSuccessProbability: jest.fn() };
  const mockOrchestrator = { complete: jest.fn() };

  let service: WealthDnaService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.wealthDnaProfile.findUnique.mockResolvedValue(null);
    mockPrisma.wealthDnaProfile.upsert.mockResolvedValue({ computedAt: new Date("2026-09-07T00:00:00.000Z") });
    mockGoals.findAll.mockResolvedValue([]);
    mockOrchestrator.complete.mockResolvedValue({ text: "", modelUsed: "mock" });
    service = new WealthDnaService(
      mockPrisma as never,
      mockRiskEngine as never,
      mockIncome as never,
      mockTransactions as never,
      mockGoals as never,
      mockOrchestrator as never,
    );
  });

  describe("recompute", () => {
    it("returns insufficientData when there's no risk profile, income, or expense history at all", async () => {
      mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: null, subScores: [], computedAt: "", cached: false });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 0, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(null);

      const result = await service.recompute("user-1");

      expect(result).toMatchObject({ insufficientData: true });
      expect(mockPrisma.wealthDnaProfile.upsert).not.toHaveBeenCalled();
    });

    it("classifies Debt-Focused Rebuilder from a real high debt sub-score, and persists it", async () => {
      mockRiskEngine.getRiskProfile.mockResolvedValue({
        overallScore: 50,
        subScores: [{ key: "debt", label: "Debt Risk", score: 75, level: "high", explanation: "" }],
        computedAt: "", cached: false,
      });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 100_000, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(80_000);
      mockOrchestrator.complete.mockResolvedValue({ text: "A real narrative.", modelUsed: "mock" });

      const result = await service.recompute("user-1");

      expect(result).toMatchObject({ archetype: "Debt-Focused Rebuilder", narrative: "A real narrative.", isLLMGenerated: true });
      expect(mockPrisma.wealthDnaProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "user-1" }, create: expect.objectContaining({ archetype: "Debt-Focused Rebuilder" }) }),
      );
    });

    it("treats an insufficientData debt sub-score as null, not as 0 (never guesses a low-risk read from missing data)", async () => {
      mockRiskEngine.getRiskProfile.mockResolvedValue({
        overallScore: 20,
        subScores: [{ key: "debt", label: "Debt Risk", insufficientData: true, reason: "no liabilities data" }],
        computedAt: "", cached: false,
      });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 100_000, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(90_000);

      const result = await service.recompute("user-1");

      // Falls through past Debt-Focused Rebuilder (debtRiskScore is null, not 75) to Capital Preserver (low overall risk).
      expect(result).toMatchObject({ archetype: "Capital Preserver" });
    });

    it("computes passiveIncomeSharePct correctly from the income breakdown by source type", async () => {
      mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: 45, subScores: [], computedAt: "", cached: false });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({
        monthlyAmount: 100_000,
        currency: "INR",
        breakdown: [
          { sourceType: "SALARY", monthlyAmount: 55_000 },
          { sourceType: "DIVIDENDS", monthlyAmount: 30_000 },
          { sourceType: "RENTAL", monthlyAmount: 15_000 },
        ],
      });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(90_000);

      const result = await service.recompute("user-1");
      if ("insufficientData" in result) throw new Error("unexpected insufficientData");
      expect(result.signals.passiveIncomeSharePct).toBeCloseTo(45, 6); // (30000+15000)/100000 * 100
      expect(result).toMatchObject({ archetype: "Income Generator" });
    });

    it("computes avgGoalAggressiveness across active, not-yet-achieved goals only", async () => {
      mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: 40, subScores: [], computedAt: "", cached: false });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 100_000, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(80_000); // 20% savings rate
      mockGoals.findAll.mockResolvedValue([{ id: "g1" }, { id: "g2" }, { id: "g3" }]);
      mockGoals.getSuccessProbability.mockImplementation((_userId: string, goalId: string) => {
        if (goalId === "g1") return Promise.resolve({ alreadyAchieved: false, requiredMonthlyContribution: 40_000, monthsRemaining: 12, contributionUsed: 40_000, probabilityOfTarget: 0.5, isAssumedReturn: false, assumedAnnualReturnPct: 10, assumedAnnualVolatilityPct: 12 });
        if (goalId === "g2") return Promise.resolve({ alreadyAchieved: true, requiredMonthlyContribution: 0, monthsRemaining: 0, contributionUsed: 0, probabilityOfTarget: 1, isAssumedReturn: false, assumedAnnualReturnPct: 0, assumedAnnualVolatilityPct: 0 });
        return Promise.resolve({ error: true, reason: "target date passed" });
      });

      const result = await service.recompute("user-1");
      if ("insufficientData" in result) throw new Error("unexpected insufficientData");
      // Only g1 contributes: 40000/100000 = 0.4 -- g2 (achieved) and g3 (error) are excluded.
      expect(result.signals.avgGoalAggressiveness).toBeCloseTo(0.4, 6);
      expect(result).toMatchObject({ archetype: "Growth Builder" });
    });

    it("falls back to the template narrative (never blocks) when the LLM fails", async () => {
      mockRiskEngine.getRiskProfile.mockResolvedValue({
        overallScore: 50,
        subScores: [{ key: "debt", label: "Debt Risk", score: 75, level: "high", explanation: "" }],
        computedAt: "", cached: false,
      });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 100_000, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(80_000);
      mockOrchestrator.complete.mockRejectedValue(new Error("LLM down"));

      const result = await service.recompute("user-1");

      expect(result).toMatchObject({ isLLMGenerated: false });
      if (!("insufficientData" in result)) {
        expect(result.narrative).toContain("Debt-Focused Rebuilder");
      }
    });
  });

  describe("getProfile", () => {
    it("returns the stored profile without recomputing when one exists and forceRefresh is false", async () => {
      mockPrisma.wealthDnaProfile.findUnique.mockResolvedValue({
        archetype: "Balanced Optimizer", narrative: "stored narrative", isLLMGenerated: true,
        signals: { overallRiskScore: 40 }, computedAt: new Date("2026-01-01T00:00:00.000Z"),
      });

      const result = await service.getProfile("user-1");

      expect(result).toMatchObject({ archetype: "Balanced Optimizer", narrative: "stored narrative" });
      expect(mockRiskEngine.getRiskProfile).not.toHaveBeenCalled();
    });

    it("recomputes when forceRefresh is true, even if a stored profile exists", async () => {
      mockPrisma.wealthDnaProfile.findUnique.mockResolvedValue({
        archetype: "Balanced Optimizer", narrative: "stale", isLLMGenerated: true, signals: {}, computedAt: new Date(),
      });
      mockRiskEngine.getRiskProfile.mockResolvedValue({ overallScore: 20, subScores: [], computedAt: "", cached: false });
      mockIncome.getMonthlyPassiveIncome.mockResolvedValue({ monthlyAmount: 100_000, currency: "INR", breakdown: [] });
      mockTransactions.getAverageMonthlyExpense.mockResolvedValue(95_000);

      const result = await service.getProfile("user-1", true);

      expect(mockRiskEngine.getRiskProfile).toHaveBeenCalled();
      expect(result).toMatchObject({ archetype: "Capital Preserver" });
    });
  });
});
