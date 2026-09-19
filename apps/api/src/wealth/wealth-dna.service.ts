import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RiskEngineService } from "../risk/risk-engine.service";
import { isInsufficientRiskSubScore } from "../risk/risk-scoring";
import { IncomeService } from "../income/income.service";
import { TransactionsService } from "../transactions/transactions.service";
import { GoalsService } from "../goals/goals.service";
import { LlmOrchestratorService } from "../ai/llm/llm-orchestrator.service";
import { classifyWealthDna, type WealthDnaSignals, type WealthDnaClassification } from "./wealth-dna-classifier";
import type { IncomeSourceType } from "@prisma/client";

/** Sources that pay independently of active work — the "Income Generator"
 * archetype's whole premise. SALARY/BUSINESS/FREELANCE (and the ambiguous
 * OTHER, defaulted conservatively to active) all require ongoing effort. */
const PASSIVE_SOURCE_TYPES: ReadonlySet<IncomeSourceType> = new Set(["DIVIDENDS", "RENTAL", "ROYALTIES", "INTEREST", "AFFILIATE", "YOUTUBE"]);

export interface WealthDnaProfileResult {
  archetype: string;
  narrative: string;
  isLLMGenerated: boolean;
  signals: WealthDnaSignals;
  computedAt: string;
}

export interface WealthDnaInsufficientData {
  insufficientData: true;
  reason: string;
  signals: WealthDnaSignals;
  computedAt: string;
}

/**
 * Phase 20 — Wealth DNA classifier, data-assembly layer. Gathers REAL
 * signals from Phase 12 (risk), Phase 10 (income mix, savings rate), and
 * Phase 13 (goal aggressiveness), hands them to the pure
 * `classifyWealthDna` rule chain, then — ONLY for the 2-3 sentence
 * descriptive narrative, never the archetype decision itself — calls the
 * LLM with a template fallback on failure, the exact same discipline as
 * `AiReportService.narrate`/`templateNarrative`. One current row per user
 * in `WealthDnaProfile` (upserted on recompute, not a daily-snapshot
 * history — see the Phase 20 plan's non-goals).
 */
@Injectable()
export class WealthDnaService {
  private readonly logger = new Logger(WealthDnaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskEngine: RiskEngineService,
    private readonly income: IncomeService,
    private readonly transactions: TransactionsService,
    private readonly goals: GoalsService,
    private readonly orchestrator: LlmOrchestratorService,
  ) {}

  /** Serves the existing stored profile unless `forceRefresh` — recomputing
   * fans out across 4 other services (risk/income/transactions/goals), so
   * this isn't cheap enough to run on every page load by default. */
  async getProfile(userId: string, forceRefresh = false): Promise<WealthDnaProfileResult | WealthDnaInsufficientData> {
    if (!forceRefresh) {
      const existing = await this.prisma.wealthDnaProfile.findUnique({ where: { userId } });
      if (existing) {
        return {
          archetype: existing.archetype,
          narrative: existing.narrative,
          isLLMGenerated: existing.isLLMGenerated,
          signals: existing.signals as unknown as WealthDnaSignals,
          computedAt: existing.computedAt.toISOString(),
        };
      }
    }
    return this.recompute(userId);
  }

  async recompute(userId: string): Promise<WealthDnaProfileResult | WealthDnaInsufficientData> {
    const signals = await this.gatherSignals(userId);
    const classification = classifyWealthDna(signals);

    if ("insufficientData" in classification) {
      return { ...classification, computedAt: new Date().toISOString() };
    }

    const { narrative, isLLMGenerated } = await this.narrate(classification);

    const row = await this.prisma.wealthDnaProfile.upsert({
      where: { userId },
      create: { userId, archetype: classification.archetype, signals: signals as unknown as object, narrative, isLLMGenerated },
      update: { archetype: classification.archetype, signals: signals as unknown as object, narrative, isLLMGenerated, computedAt: new Date() },
    });

    return { archetype: classification.archetype, narrative, isLLMGenerated, signals, computedAt: row.computedAt.toISOString() };
  }

  // ─── Data assembly ────────────────────────────────────────────────────────

  private async gatherSignals(userId: string): Promise<WealthDnaSignals> {
    const [riskProfile, incomeResult, avgMonthlyExpense, goalList] = await Promise.all([
      this.riskEngine.getRiskProfile(userId),
      this.income.getMonthlyPassiveIncome(userId),
      this.transactions.getAverageMonthlyExpense(userId, 3),
      this.goals.findAll(userId),
    ]);

    const overallRiskScore = riskProfile.overallScore;
    const debtSubScore = riskProfile.subScores.find((s) => s.key === "debt");
    const debtRiskScore = debtSubScore && !isInsufficientRiskSubScore(debtSubScore) ? debtSubScore.score : null;

    const monthlyIncome = incomeResult.monthlyAmount;
    const savingsRatePct = monthlyIncome > 0 && avgMonthlyExpense !== null ? ((monthlyIncome - avgMonthlyExpense) / monthlyIncome) * 100 : null;

    let passiveIncomeSharePct: number | null = null;
    if (monthlyIncome > 0) {
      const passiveTotal = incomeResult.breakdown
        .filter((b) => PASSIVE_SOURCE_TYPES.has(b.sourceType as IncomeSourceType))
        .reduce((sum, b) => sum + b.monthlyAmount, 0);
      passiveIncomeSharePct = (passiveTotal / monthlyIncome) * 100;
    }

    const avgGoalAggressiveness = await this.computeAvgGoalAggressiveness(userId, goalList, monthlyIncome);

    return { overallRiskScore, debtRiskScore, savingsRatePct, passiveIncomeSharePct, avgGoalAggressiveness };
  }

  private async computeAvgGoalAggressiveness(
    userId: string,
    goalList: Array<{ id: string }>,
    monthlyIncome: number,
  ): Promise<number | null> {
    if (goalList.length === 0 || monthlyIncome <= 0) return null;

    const ratios: number[] = [];
    for (const goal of goalList) {
      const probability = await this.goals.getSuccessProbability(userId, goal.id).catch(() => null);
      if (!probability || "error" in probability || probability.alreadyAchieved) continue;
      ratios.push(probability.requiredMonthlyContribution / monthlyIncome);
    }
    if (ratios.length === 0) return null;
    return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  }

  // ─── Narrative (LLM-narrates, never decides) ─────────────────────────────

  private async narrate(classification: WealthDnaClassification): Promise<{ narrative: string; isLLMGenerated: boolean }> {
    const prompt = `In 2-3 warm, plain-English sentences, describe a personal-finance user classified with the "${classification.archetype}" Wealth DNA archetype. The real reasoning behind this classification: ${classification.reason}. Do NOT invent or restate any number not present in that reasoning, and do not question or second-guess the classification. Do not add a greeting or sign-off, just the description.`;
    try {
      const result = await this.orchestrator.complete([{ role: "user", content: prompt }]);
      const text = result.text.trim();
      if (!text) throw new Error("LLM returned an empty narrative");
      return { narrative: text, isLLMGenerated: true };
    } catch (err) {
      this.logger.warn(`LLM narrative generation failed, using template fallback: ${String(err)}`);
      return { narrative: this.templateNarrative(classification), isLLMGenerated: false };
    }
  }

  /** Real fallback (not a stub) built entirely from the classification's own reason string. */
  private templateNarrative(classification: WealthDnaClassification): string {
    return `Your Wealth DNA archetype is "${classification.archetype}." ${classification.reason}`;
  }
}
