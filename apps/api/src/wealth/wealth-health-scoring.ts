/**
 * Phase 20 — pure Wealth Health Score math. No Prisma, no HTTP, no NestJS
 * DI: every function here is a deterministic function of plain numbers, the
 * same "data assembly vs. calculation" split as Phase 12's risk-scoring.ts
 * (which this file mirrors directly, right down to the insufficientData/
 * renormalization pattern) — data ASSEMBLY (querying every source module)
 * lives in wealth-health.service.ts, this file owns none of that.
 *
 * SCALE: every sub-score is 0-100, where 100 = HEALTHIEST (the OPPOSITE
 * convention from risk-scoring.ts, where 100 = highest risk — chosen
 * because "Wealth Health Score" reads naturally with bigger = better, the
 * same way a credit score does).
 *
 * The full weighting methodology, every threshold below, and the rationale
 * for each is written out in WEALTH_HEALTH_METHODOLOGY.md at the repo
 * root — this file's comments summarize the same numbers so the two can't
 * drift silently out of sync without a diff showing it.
 */

export type WealthHealthDimensionKey = "diversification" | "risk" | "savingsRate" | "taxEfficiency" | "goalProgress" | "insurance";

export type WealthHealthLevel = "critical" | "needsAttention" | "good" | "excellent";

export interface WealthHealthSubScore {
  key: WealthHealthDimensionKey;
  label: string;
  score: number; // 0-100, 100 = healthiest
  level: WealthHealthLevel;
  explanation: string;
  insufficientData?: false;
}

export interface InsufficientWealthHealthSubScore {
  key: WealthHealthDimensionKey;
  label: string;
  insufficientData: true;
  reason: string;
}

export type AnyWealthHealthSubScore = WealthHealthSubScore | InsufficientWealthHealthSubScore;

export function isInsufficientWealthHealthSubScore(s: AnyWealthHealthSubScore): s is InsufficientWealthHealthSubScore {
  return "insufficientData" in s && s.insufficientData === true;
}

/** Shared 0-100 → label thresholds, used by every sub-score for consistency. */
export function healthLevel(score: number): WealthHealthLevel {
  if (score < 40) return "critical";
  if (score < 60) return "needsAttention";
  if (score < 80) return "good";
  return "excellent";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── 1. Diversification ─────────────────────────────────────────────────────

export interface DiversificationHealthInput {
  /** AnalyticsService.getAllocation(userId).overallDiversificationScore — Phase 11, already 0-100 with 100=best. */
  overallDiversificationScore: number;
}

/** Direct passthrough — Phase 11's diversification score already uses the
 * SAME 100=best convention as this composite, so no inversion or rescaling
 * is needed (unlike the risk sub-score below). */
export function diversificationHealth(input: DiversificationHealthInput): WealthHealthSubScore {
  const score = clamp(input.overallDiversificationScore, 0, 100);
  const level = healthLevel(score);
  const explanation = `Your diversification is ${level} — a diversification score of ${score.toFixed(0)}/100 across asset class, sector, geography, currency, and market cap.`;
  return { key: "diversification", label: "Diversification", score, level, explanation };
}

// ─── 2. Risk composite ──────────────────────────────────────────────────────

export interface RiskCompositeHealthInput {
  /** RiskEngineService.getRiskProfile(userId).overallScore — Phase 12, 0-100 with 100=RISKIEST. Null if insufficient data. */
  overallRiskScore: number | null;
}

/** Inverted Phase 12 composite (100 - overallRiskScore), NOT re-derived from
 * the individual risk sub-scores — reusing the one real risk number avoids
 * double-counting the same market/debt/liquidity/etc. inputs under a second
 * set of weights. */
export function riskCompositeHealth(input: RiskCompositeHealthInput): AnyWealthHealthSubScore {
  if (input.overallRiskScore === null) {
    return { key: "risk", label: "Risk Profile", insufficientData: true, reason: "Not enough data yet to compute a risk profile (see the Risk Engine)." };
  }
  const score = clamp(100 - input.overallRiskScore, 0, 100);
  const level = healthLevel(score);
  const explanation = `Your risk profile is ${level} — an inverted overall risk score of ${input.overallRiskScore.toFixed(0)}/100 from the Risk Engine (higher risk there means lower health here).`;
  return { key: "risk", label: "Risk Profile", score, level, explanation };
}

// ─── 3. Savings rate ────────────────────────────────────────────────────────

export interface SavingsRateHealthInput {
  /** IncomeService.getMonthlyPassiveIncome(userId).monthlyAmount — despite
   * the method's name it sums EVERY active recurring Income entry
   * (including SALARY), so this is the user's real total monthly income. */
  monthlyIncome: number;
  /** TransactionsService.getAverageMonthlyExpense(userId, 3) — null when
   * there's no expense history yet. */
  avgMonthlyExpense: number | null;
}

/** savingsRate = (income - expense) / income. Anchors: 20% savings rate (a
 * commonly cited "good" personal-finance target) maps to the 100 cap; 0% or
 * negative (spending >= income) floors at 0; linear in between. */
const SAVINGS_RATE_AT_100_SCORE_PCT = 20;

export function savingsRateHealth(input: SavingsRateHealthInput): AnyWealthHealthSubScore {
  const { monthlyIncome, avgMonthlyExpense } = input;
  if (monthlyIncome <= 0) {
    return { key: "savingsRate", label: "Savings Rate", insufficientData: true, reason: "No recurring income recorded yet." };
  }
  if (avgMonthlyExpense === null) {
    return { key: "savingsRate", label: "Savings Rate", insufficientData: true, reason: "No expense/transaction history yet to compute an average monthly expense." };
  }
  const savingsRatePct = ((monthlyIncome - avgMonthlyExpense) / monthlyIncome) * 100;
  const score = clamp((savingsRatePct / SAVINGS_RATE_AT_100_SCORE_PCT) * 100, 0, 100);
  const level = healthLevel(score);
  const explanation =
    savingsRatePct >= 0
      ? `Your savings rate is ${level} — you save ${pct(savingsRatePct)} of your monthly income, against a ${SAVINGS_RATE_AT_100_SCORE_PCT}% healthy-savings target.`
      : `Your savings rate is ${level} — your average monthly expenses exceed your income by ${pct(Math.abs(savingsRatePct))}.`;
  return { key: "savingsRate", label: "Savings Rate", score, level, explanation };
}

// ─── 4. Tax efficiency ──────────────────────────────────────────────────────

export interface TaxEfficiencyHealthInput {
  /** Sum of abs(unrealizedLoss) across HarvestingService.getHarvestCandidates(userId, countryCode) — real, un-harvested tax-loss-harvesting opportunity left on the table. */
  totalHarvestableLoss: number;
  /** NetWorthService.calculateNetWorth(userId).totalAssets.toNumber() */
  totalAssets: number;
}

/** harvestablePct = totalHarvestableLoss / totalAssets. 10% of the
 * portfolio sitting in un-harvested losses maps to the 0 floor (fully
 * inefficient); 0% maps to the 100 cap (nothing being left on the table). */
const HARVESTABLE_PCT_AT_0_SCORE = 10;

export function taxEfficiencyHealth(input: TaxEfficiencyHealthInput): AnyWealthHealthSubScore {
  const { totalHarvestableLoss, totalAssets } = input;
  if (totalAssets <= 0) {
    return { key: "taxEfficiency", label: "Tax Efficiency", insufficientData: true, reason: "No assets recorded yet." };
  }
  const harvestablePct = clamp((totalHarvestableLoss / totalAssets) * 100, 0, 100);
  const score = clamp(100 - (harvestablePct / HARVESTABLE_PCT_AT_0_SCORE) * 100, 0, 100);
  const level = healthLevel(score);
  const explanation =
    harvestablePct > 0
      ? `Your tax efficiency is ${level} — ${pct(harvestablePct)} of your portfolio sits in unrealized losses that haven't been harvested yet (see the Opportunity Scanner / Tax Center).`
      : `Your tax efficiency is ${level} — no meaningful unrealized-loss tax-harvesting opportunity is currently being left on the table.`;
  return { key: "taxEfficiency", label: "Tax Efficiency", score, level, explanation };
}

// ─── 5. Goal progress ───────────────────────────────────────────────────────

export interface GoalProgressHealthInput {
  /** GoalsService.findAll(userId)'s percentComplete for each active goal, 0-100 each. */
  goalPercentCompletes: number[];
}

export function goalProgressHealth(input: GoalProgressHealthInput): AnyWealthHealthSubScore {
  const { goalPercentCompletes } = input;
  if (goalPercentCompletes.length === 0) {
    return { key: "goalProgress", label: "Goal Progress", insufficientData: true, reason: "No active goals set yet." };
  }
  const score = clamp(goalPercentCompletes.reduce((s, p) => s + p, 0) / goalPercentCompletes.length, 0, 100);
  const level = healthLevel(score);
  const explanation = `Your goal progress is ${level} — an average of ${score.toFixed(0)}% complete across ${goalPercentCompletes.length} active goal${goalPercentCompletes.length === 1 ? "" : "s"}.`;
  return { key: "goalProgress", label: "Goal Progress", score, level, explanation };
}

// ─── 6. Insurance adequacy ──────────────────────────────────────────────────

export interface InsuranceAdequacyHealthInput {
  /** Sum of Asset.currentValue where type=INSURANCE, base-currency-converted. */
  insuranceValue: number;
  /** IncomeService.getMonthlyPassiveIncome(userId).monthlyAmount * 12. */
  annualIncome: number;
}

/** A COVERAGE-AMOUNT PROXY, not a real premium/dependents-aware adequacy
 * calculation — no Insurance data model exists in this app (only
 * AssetType.INSURANCE), so this is explicitly documented as approximate in
 * WEALTH_HEALTH_METHODOLOGY.md. Target: 10x annual income (a common
 * term-life rule-of-thumb), reaching the 100 cap at 100% of that target. */
const INSURANCE_COVERAGE_TARGET_MULTIPLE = 10;

export function insuranceAdequacyHealth(input: InsuranceAdequacyHealthInput): AnyWealthHealthSubScore {
  const { insuranceValue, annualIncome } = input;
  if (annualIncome <= 0) {
    return { key: "insurance", label: "Insurance Adequacy", insufficientData: true, reason: "No recurring income recorded yet, so an income-based coverage target can't be computed." };
  }
  const target = annualIncome * INSURANCE_COVERAGE_TARGET_MULTIPLE;
  const coverageRatio = insuranceValue / target;
  const score = clamp(coverageRatio * 100, 0, 100);
  const level = healthLevel(score);
  const explanation = `Your insurance adequacy is ${level} — recorded insurance coverage is ${(coverageRatio * 100).toFixed(0)}% of the ${INSURANCE_COVERAGE_TARGET_MULTIPLE}x-annual-income target (a coverage-amount proxy, not a premium/dependents-aware calculation).`;
  return { key: "insurance", label: "Insurance Adequacy", score, level, explanation };
}

// ─── Composite overall score ────────────────────────────────────────────────

/**
 * Fixed weights, summing to 100: diversification and risk each anchor the
 * composite at 20 (the two broadest, most-studied determinants of realized
 * long-run outcomes); savings rate also gets 20 since it's the single
 * biggest lever a user directly controls month to month; tax efficiency and
 * goal progress each get 15 (real, but narrower in scope); insurance gets
 * 10, reflecting both its lower weight in typical wealth outcomes AND the
 * documented approximation in how it's computed. When a sub-score is
 * insufficientData, its weight is dropped and the remaining weights are
 * renormalized proportionally so they still sum to 100 — never silently
 * treated as 0.
 */
export const WEALTH_HEALTH_WEIGHTS: Record<WealthHealthDimensionKey, number> = {
  diversification: 20,
  risk: 20,
  savingsRate: 20,
  taxEfficiency: 15,
  goalProgress: 15,
  insurance: 10,
};

export function overallWealthHealthScore(subScores: AnyWealthHealthSubScore[]): number | null {
  const available = subScores.filter((s): s is WealthHealthSubScore => !isInsufficientWealthHealthSubScore(s));
  if (available.length === 0) return null;
  const totalWeight = available.reduce((sum, s) => sum + WEALTH_HEALTH_WEIGHTS[s.key], 0);
  if (totalWeight === 0) return null;
  const weightedSum = available.reduce((sum, s) => sum + s.score * WEALTH_HEALTH_WEIGHTS[s.key], 0);
  return weightedSum / totalWeight;
}
