/**
 * Phase 20 — Wealth DNA classifier. Pure, deterministic, RULES-based (no
 * LLM, no quiz) — mirrors the "rules decide, LLM only writes prose"
 * discipline already established by `SuggestionEngineService` and
 * `AiReportService`: the archetype itself is a documented threshold check
 * against REAL behavior/risk/goal data; the LLM (in `wealth-dna.service.ts`)
 * is only ever asked to write 2-3 descriptive sentences ABOUT an
 * already-decided archetype, never to decide the archetype itself.
 *
 * No I/O, no Prisma, no HTTP — same "data assembly vs. calculation" split
 * as `risk-scoring.ts` / `wealth-health-scoring.ts`.
 */

export type WealthDnaArchetype = "Debt-Focused Rebuilder" | "Income Generator" | "Growth Builder" | "Capital Preserver" | "Balanced Optimizer";

export interface WealthDnaSignals {
  /** Phase 12 RiskEngineService.getRiskProfile(userId).overallScore — 0-100, 100 = riskiest. Null if no risk profile is computable yet. */
  overallRiskScore: number | null;
  /** The 'debt' dimension specifically from that same risk profile's subScores — 0-100, 100 = riskiest. Null if unavailable. */
  debtRiskScore: number | null;
  /** (monthlyIncome - avgMonthlyExpense) / monthlyIncome * 100. Null if income or expense history is unavailable. */
  savingsRatePct: number | null;
  /** Share of monthly income from passive sources (DIVIDENDS/RENTAL/ROYALTIES/INTEREST/AFFILIATE/YOUTUBE) vs. active (SALARY/BUSINESS/FREELANCE/OTHER), 0-100. Null if there's no income recorded at all. */
  passiveIncomeSharePct: number | null;
  /** Average, across active goals, of (requiredMonthlyContribution / monthlyIncome) — how much of the user's income their goals demand. Null if there are no active goals or no income to divide by. */
  avgGoalAggressiveness: number | null;
}

export interface WealthDnaClassification {
  archetype: WealthDnaArchetype;
  /** Which rule fired and on what real numbers — feeds the LLM narrative prompt AND is shown directly if the LLM is unreachable. */
  reason: string;
  signals: WealthDnaSignals;
}

export interface InsufficientWealthDnaData {
  insufficientData: true;
  reason: string;
  signals: WealthDnaSignals;
}

// ─── Documented thresholds ───────────────────────────────────────────────
const DEBT_FOCUSED_THRESHOLD = 60; // debt risk sub-score (100=riskiest) at/above this dominates the read
const INCOME_GENERATOR_THRESHOLD_PCT = 40; // passive income share at/above this
const GROWTH_BUILDER_RISK_THRESHOLD = 55; // overall risk score at/above this
const GROWTH_BUILDER_SAVINGS_THRESHOLD_PCT = 15; // AND savings rate at/above this
const GROWTH_BUILDER_GOAL_AGGRESSIVENESS_THRESHOLD = 0.3; // OR goals alone demanding this share of income (AND the same savings-rate floor)
const CAPITAL_PRESERVER_RISK_THRESHOLD = 30; // overall risk score at/below this

/**
 * Priority-ordered rule chain — each branch is evaluated in order, and the
 * FIRST one whose real signal(s) clear its documented threshold wins:
 *
 *   1. Debt-Focused Rebuilder — a high debt-risk sub-score dominates the
 *      financial picture regardless of everything else; paying down
 *      high-cost debt is the priority no matter how the rest of the
 *      portfolio looks.
 *   2. Income Generator — a large share of income already comes from
 *      passive sources (dividends, rental, royalties, interest).
 *   3. Growth Builder — EITHER actively taking on above-average portfolio
 *      risk, OR pursuing unusually demanding goal targets (goals alone
 *      requiring a large share of income) — AND saving well above the norm
 *      either way. Two different real behaviors (risk-taking in the
 *      portfolio vs. aggressive goal-funding) both read as "building
 *      aggressively" when paired with a strong savings rate.
 *   4. Capital Preserver — a below-average risk profile, prioritizing
 *      safety over growth.
 *   5. Balanced Optimizer — the default: doesn't clearly fit any of the
 *      above, OR there's genuinely not enough signal to say something more
 *      specific (deliberately the same bucket, since "no strong signal in
 *      any direction" and "moderate on every axis" look identical from the
 *      outside).
 *
 * Returns `insufficientData` only when EVERY signal is null (a brand-new
 * user with no risk profile, no income, and no goals at all) — anything
 * less than total absence of data still produces a real (if default)
 * archetype, since "Balanced Optimizer" IS a legitimate read of partial
 * data, not a placeholder.
 */
export function classifyWealthDna(signals: WealthDnaSignals): WealthDnaClassification | InsufficientWealthDnaData {
  const { overallRiskScore, debtRiskScore, savingsRatePct, passiveIncomeSharePct, avgGoalAggressiveness } = signals;

  if (overallRiskScore === null && debtRiskScore === null && savingsRatePct === null && passiveIncomeSharePct === null) {
    return { insufficientData: true, reason: "Not enough financial data recorded yet (no risk profile, income, or expense history) to classify a Wealth DNA archetype.", signals };
  }

  if (debtRiskScore !== null && debtRiskScore >= DEBT_FOCUSED_THRESHOLD) {
    return {
      archetype: "Debt-Focused Rebuilder",
      reason: `Debt risk sub-score is ${debtRiskScore.toFixed(0)}/100, at or above the ${DEBT_FOCUSED_THRESHOLD} threshold — high-cost debt is the dominant factor in the financial picture right now.`,
      signals,
    };
  }

  if (passiveIncomeSharePct !== null && passiveIncomeSharePct >= INCOME_GENERATOR_THRESHOLD_PCT) {
    return {
      archetype: "Income Generator",
      reason: `${passiveIncomeSharePct.toFixed(0)}% of monthly income comes from passive sources (dividends, rental, royalties, interest), at or above the ${INCOME_GENERATOR_THRESHOLD_PCT}% threshold.`,
      signals,
    };
  }

  const highSavingsRate = savingsRatePct !== null && savingsRatePct >= GROWTH_BUILDER_SAVINGS_THRESHOLD_PCT;
  if (highSavingsRate && overallRiskScore !== null && overallRiskScore >= GROWTH_BUILDER_RISK_THRESHOLD) {
    return {
      archetype: "Growth Builder",
      reason: `Overall risk score is ${overallRiskScore.toFixed(0)}/100 (at or above ${GROWTH_BUILDER_RISK_THRESHOLD}) while saving ${(savingsRatePct as number).toFixed(0)}% of income (at or above ${GROWTH_BUILDER_SAVINGS_THRESHOLD_PCT}%) — actively taking on above-average portfolio risk while building aggressively.`,
      signals,
    };
  }
  if (highSavingsRate && avgGoalAggressiveness !== null && avgGoalAggressiveness >= GROWTH_BUILDER_GOAL_AGGRESSIVENESS_THRESHOLD) {
    return {
      archetype: "Growth Builder",
      reason: `Active goals alone require ${(avgGoalAggressiveness * 100).toFixed(0)}% of monthly income on average (at or above ${(GROWTH_BUILDER_GOAL_AGGRESSIVENESS_THRESHOLD * 100).toFixed(0)}%), while saving ${(savingsRatePct as number).toFixed(0)}% of income overall — pursuing unusually demanding goal targets.`,
      signals,
    };
  }

  if (overallRiskScore !== null && overallRiskScore <= CAPITAL_PRESERVER_RISK_THRESHOLD) {
    return {
      archetype: "Capital Preserver",
      reason: `Overall risk score is ${overallRiskScore.toFixed(0)}/100, at or below the ${CAPITAL_PRESERVER_RISK_THRESHOLD} threshold — the portfolio is positioned to prioritize safety over growth.`,
      signals,
    };
  }

  return {
    archetype: "Balanced Optimizer",
    reason: "No single dimension (debt, passive income, aggressive risk-taking, or capital preservation) clearly dominates — a balanced profile across risk, savings, and income sources.",
    signals,
  };
}
