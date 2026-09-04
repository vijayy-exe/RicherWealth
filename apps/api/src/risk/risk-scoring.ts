/**
 * Phase 12 — pure risk-scoring math. No Prisma, no HTTP, no NestJS DI:
 * every function here is a deterministic function of plain numbers, so it
 * can be unit-tested against a fixed synthetic portfolio the same way
 * Phase 11's quant engine was (see apps/quant/analytics/risk_metrics.py).
 * All data ASSEMBLY (querying Postgres, calling AnalyticsService/FRED) lives
 * in risk-engine.service.ts — this file owns none of that, mirroring the
 * "data assembly vs calculation" split from Phase 11.
 *
 * SCALE: every sub-score is 0-100, where 100 = highest risk (opposite
 * convention from Phase 11's diversification score, where 100 = best —
 * chosen because a "risk radar chart" reads naturally with bigger = riskier).
 *
 * The full weighting methodology, every threshold below, and the rationale
 * for each is written out in RISK_METHODOLOGY.md at the repo root — this
 * file's comments summarize the same numbers so the two can't drift silently
 * out of sync without a diff showing it.
 */

export type RiskDimensionKey =
  | "liquidity"
  | "debt"
  | "inflation"
  | "currency"
  | "market"
  | "interestRate"
  | "credit";

export type RiskLevel = "low" | "moderate" | "elevated" | "high";

export interface RiskSubScore {
  key: RiskDimensionKey;
  label: string;
  score: number; // 0-100, 100 = highest risk
  level: RiskLevel;
  explanation: string;
  insufficientData?: false;
}

export interface InsufficientRiskSubScore {
  key: RiskDimensionKey;
  label: string;
  insufficientData: true;
  reason: string;
}

export type AnyRiskSubScore = RiskSubScore | InsufficientRiskSubScore;

export function isInsufficientRiskSubScore(s: AnyRiskSubScore): s is InsufficientRiskSubScore {
  return "insufficientData" in s && s.insufficientData === true;
}

/** Shared 0-100 → label thresholds, used by every sub-score for consistency. */
export function riskLevel(score: number): RiskLevel {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "elevated";
  return "high";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── 1. Liquidity risk ──────────────────────────────────────────────────────

export interface LiquidityRiskInput {
  /** % of total assets held as CASH (0-100). */
  cashPercent: number;
}

/**
 * Target cash reserve: 15% of total assets — a common personal-finance
 * rule-of-thumb "liquid reserve" figure (broader than the stricter
 * "N months of expenses" emergency-fund test, chosen here because the
 * required input is explicitly "liquidity data (cash %)", not expense data).
 * Risk falls linearly to 0 as cashPercent reaches the target; 0% cash = 100
 * risk (fully illiquid).
 */
const LIQUIDITY_TARGET_CASH_PCT = 15;

export function liquidityRisk(input: LiquidityRiskInput): RiskSubScore {
  const { cashPercent } = input;
  const score = clamp(100 * (1 - cashPercent / LIQUIDITY_TARGET_CASH_PCT), 0, 100);
  const level = riskLevel(score);
  const explanation =
    cashPercent >= LIQUIDITY_TARGET_CASH_PCT
      ? `Your liquidity risk is ${level} — ${pct(cashPercent)} of your portfolio is in cash, at or above the ${LIQUIDITY_TARGET_CASH_PCT}% healthy-reserve target.`
      : `Your liquidity risk is ${level} because only ${pct(cashPercent)} of your portfolio is in cash, below the ${LIQUIDITY_TARGET_CASH_PCT}% target reserve — a sudden expense could force you to sell illiquid holdings.`;
  return { key: "liquidity", label: "Liquidity Risk", score, level, explanation };
}

// ─── 2. Debt risk ───────────────────────────────────────────────────────────

export interface DebtRiskInput {
  /** totalLiabilities / totalAssets, as a ratio (0.3 = 30%), from NetWorthService (Phase 9). */
  debtRatio: number;
}

/**
 * Linear scale referencing the SAME thresholds the Dashboard already uses to
 * color-code debtRatio (net-worth.service.ts / dashboard/page.tsx): <=30% =
 * good, <=50% = moderate, >50% = high. score = debtRatio / 0.75 * 100 puts
 * 30% at 40 (moderate), 50% at ~66.7 (elevated — roughly where the
 * dashboard's amber-to-red cutoff sits), and 75%+ at the 100 cap.
 */
const DEBT_RATIO_AT_100_SCORE = 0.75;

export function debtRisk(input: DebtRiskInput): RiskSubScore {
  const { debtRatio } = input;
  const score = clamp((debtRatio / DEBT_RATIO_AT_100_SCORE) * 100, 0, 100);
  const level = riskLevel(score);
  const debtRatioPct = debtRatio * 100;
  const explanation = `Your debt risk is ${level} because your liabilities are ${pct(debtRatioPct)} of your total assets.`;
  return { key: "debt", label: "Debt Risk", score, level, explanation };
}

// ─── 3. Inflation risk ──────────────────────────────────────────────────────

export interface InflationRiskInput {
  /** % of total assets in CASH + BOND (inflation-eroding, fixed-nominal-value holdings), 0-100. */
  inflationExposedPercent: number;
  /** Current YoY inflation rate, % (e.g. 4.5 meaning 4.5%), from FRED CPI. */
  currentInflationPct: number;
}

/**
 * risk = inflationExposedPercent * multiplier, where multiplier scales with
 * how far current inflation sits from the ~2% central-bank target most
 * economies target (US Fed, RBI, etc.): multiplier=1.0 at exactly 2%
 * inflation, capped to [0.5, 2.0] so a single extreme CPI print can't blow
 * the score off the 0-100 scale.
 */
const INFLATION_TARGET_PCT = 2.0;
const INFLATION_MULTIPLIER_MIN = 0.5;
const INFLATION_MULTIPLIER_MAX = 2.0;

export function inflationRisk(input: InflationRiskInput): RiskSubScore {
  const { inflationExposedPercent, currentInflationPct } = input;
  const multiplier = clamp(currentInflationPct / INFLATION_TARGET_PCT, INFLATION_MULTIPLIER_MIN, INFLATION_MULTIPLIER_MAX);
  const score = clamp(inflationExposedPercent * multiplier, 0, 100);
  const level = riskLevel(score);
  const explanation = `Your inflation risk is ${level} because ${pct(inflationExposedPercent)} of your portfolio sits in cash and bonds while inflation is running at ${pct(currentInflationPct)} (vs. a ~${INFLATION_TARGET_PCT}% target) — fixed-nominal holdings lose real value faster when inflation runs hot.`;
  return { key: "inflation", label: "Inflation Risk", score, level, explanation };
}

// ─── 4. Currency risk ───────────────────────────────────────────────────────

export interface CurrencyRiskInput {
  /** % of total assets held in a currency OTHER than the user's base currency, 0-100. */
  foreignCurrencyPercent: number;
  baseCurrency: string;
  /** The single largest non-base currency by value, for the explanation sentence. Null if fully in base currency. */
  dominantForeignCurrency: string | null;
}

/**
 * Direct 1:1 mapping: currency risk score EQUALS the % of the portfolio
 * exposed to FX movement against the base currency. No multiplier — this is
 * the most transparent, least-arguable choice (a made-up multiplier here
 * would just be an unjustified guess), and matches exactly how the feature
 * request phrased the example: "60% of your assets are in USD ... risk is
 * elevated."
 */
export function currencyRisk(input: CurrencyRiskInput): RiskSubScore {
  const { foreignCurrencyPercent, baseCurrency, dominantForeignCurrency } = input;
  const score = clamp(foreignCurrencyPercent, 0, 100);
  const level = riskLevel(score);
  const explanation =
    dominantForeignCurrency && foreignCurrencyPercent > 0
      ? `Your currency risk is ${level} because ${pct(foreignCurrencyPercent)} of your assets are in ${dominantForeignCurrency} (or other non-${baseCurrency} currencies) while your base currency is ${baseCurrency} — a move in the exchange rate changes your net worth even if the underlying asset price doesn't.`
      : `Your currency risk is ${level} — your portfolio is entirely denominated in your base currency (${baseCurrency}).`;
  return { key: "currency", label: "Currency Risk", score, level, explanation };
}

// ─── 5. Market risk ─────────────────────────────────────────────────────────

export interface MarketRiskInput {
  /** Annualized standard deviation of portfolio returns, as a decimal (0.25 = 25%). From Phase 11 risk-metrics. */
  volatility: number;
  /** Portfolio beta vs. the benchmark. From Phase 11 risk-metrics. */
  beta: number;
  /** Max drawdown as a negative decimal (-0.35 = -35%), or null if not computable. From Phase 11 risk-metrics. */
  maxDrawdown: number | null;
}

/**
 * Composite of three Phase-11-sourced components, weighted:
 *   40% volatility  — 30% annualized vol maps to the 100 cap (roughly
 *                      single-stock/crypto-level volatility; a diversified
 *                      equity index is closer to 15-18%).
 *   30% beta         — beta of 2.0 (twice as volatile as the benchmark)
 *                      maps to the 100 cap; beta of 1.0 (matches market)
 *                      sits at 50; beta of 0 floors at 0.
 *   30% max drawdown — a 50% historical peak-to-trough decline maps to the
 *                      100 cap (severe bear-market/crypto-crash territory).
 * When maxDrawdown is unavailable (short history), its 30% weight is
 * dropped and the remaining two are renormalized to 100% between them.
 */
const VOLATILITY_AT_100_SCORE = 0.30;
const BETA_AT_100_SCORE = 2.0;
const DRAWDOWN_AT_100_SCORE = 0.50;

export function marketRisk(input: MarketRiskInput): RiskSubScore {
  const { volatility, beta, maxDrawdown } = input;
  const volatilityScore = clamp((volatility / VOLATILITY_AT_100_SCORE) * 100, 0, 100);
  const betaScore = clamp((beta / BETA_AT_100_SCORE) * 100, 0, 100);

  let score: number;
  if (maxDrawdown === null) {
    // Drawdown's 30% weight redistributed proportionally across the
    // remaining two: 40/(40+30) = 4/7, 30/(40+30) = 3/7.
    score = (4 / 7) * volatilityScore + (3 / 7) * betaScore;
  } else {
    const drawdownScore = clamp((Math.abs(maxDrawdown) / DRAWDOWN_AT_100_SCORE) * 100, 0, 100);
    score = 0.4 * volatilityScore + 0.3 * betaScore + 0.3 * drawdownScore;
  }
  score = clamp(score, 0, 100);
  const level = riskLevel(score);
  const volatilityPct = volatility * 100;
  const drawdownPct = maxDrawdown !== null ? Math.abs(maxDrawdown) * 100 : null;
  const explanation =
    drawdownPct !== null
      ? `Your market risk is ${level} — annualized volatility of ${pct(volatilityPct)}, a beta of ${beta.toFixed(2)} vs. the benchmark, and a historical max drawdown of ${pct(drawdownPct)}.`
      : `Your market risk is ${level} — annualized volatility of ${pct(volatilityPct)} and a beta of ${beta.toFixed(2)} vs. the benchmark (not enough history yet for a max-drawdown reading).`;
  return { key: "market", label: "Market Risk", score, level, explanation };
}

// ─── 6. Interest-rate risk ──────────────────────────────────────────────────

export interface InterestRateRiskInput {
  /**
   * % of total OUTSTANDING DEBT in variable/revolving-rate-style products
   * (CREDIT_CARD + PERSONAL_LOAN), 0-100. The schema has no explicit
   * fixed/variable flag, so loan TYPE is used as a documented proxy:
   * mortgages/car/education loans in this app are treated as fixed-rate,
   * credit cards and personal loans as variable/revolving.
   */
  variableDebtPercent: number;
  /** Current short-term rate (3-Month T-Bill, DGS3MO via FRED), %. Reused from Phase 11's RiskFreeRateService. */
  currentShortRatePct: number;
}

/**
 * 60% variable-debt share + 40% macro rate level.
 *   variableDebtPercent is already 0-100 — used directly.
 *   currentShortRatePct scaled so 8% (well above the ~5.5% 2023 US peak,
 *   giving headroom for stress scenarios) maps to the 100 cap.
 */
const SHORT_RATE_AT_100_SCORE = 8.0;

export function interestRateRisk(input: InterestRateRiskInput): RiskSubScore {
  const { variableDebtPercent, currentShortRatePct } = input;
  const macroScore = clamp((currentShortRatePct / SHORT_RATE_AT_100_SCORE) * 100, 0, 100);
  const score = clamp(0.6 * clamp(variableDebtPercent, 0, 100) + 0.4 * macroScore, 0, 100);
  const level = riskLevel(score);
  const explanation = `Your interest-rate risk is ${level} because ${pct(variableDebtPercent)} of your debt is in variable-rate-style products (credit cards/personal loans) and the current short-term rate is ${pct(currentShortRatePct)} — rising rates raise those payments directly.`;
  return { key: "interestRate", label: "Interest-Rate Risk", score, level, explanation };
}

// ─── 7. Credit risk ─────────────────────────────────────────────────────────

export interface CreditRiskInput {
  /**
   * Weighted % of total assets exposed to issuer/counterparty default risk:
   * corporateBondPct*0.6 + municipalBondPct*0.3 + govtBondPct*0.05 +
   * p2pLendingPct*1.0 (weights applied in risk-engine.service.ts's assembly
   * layer — this input is already the single combined percentage, 0-100+).
   * This is distinct from Debt Risk: debt risk measures the USER's own
   * leverage, credit risk measures default risk in what the user HOLDS.
   */
  creditExposedPercent: number;
}

/**
 * 25% credit-exposed share maps to the 100 cap — most diversified portfolios
 * keep corporate-bond/P2P-lending exposure well under a quarter of assets,
 * so exceeding that concentrates default risk meaningfully.
 */
const CREDIT_EXPOSURE_AT_100_SCORE = 25;

export function creditRisk(input: CreditRiskInput): RiskSubScore {
  const { creditExposedPercent } = input;
  const score = clamp((creditExposedPercent / CREDIT_EXPOSURE_AT_100_SCORE) * 100, 0, 100);
  const level = riskLevel(score);
  const explanation =
    creditExposedPercent > 0
      ? `Your credit risk is ${level} because ${pct(creditExposedPercent)} of your portfolio (issuer-weighted) is in credit-risk-bearing instruments like corporate bonds or P2P lending, where the issuer or borrower could default.`
      : `Your credit risk is ${level} — you hold no corporate bonds or P2P lending positions, so there's no meaningful issuer-default exposure.`;
  return { key: "credit", label: "Credit Risk", score, level, explanation };
}

// ─── Composite overall score ────────────────────────────────────────────────

/**
 * Fixed weights, summing to 100, reflecting each dimension's typical impact
 * on realized portfolio outcomes: market risk (day-to-day value swings) and
 * debt risk (leverage/solvency) dominate; the rest are meaningful but
 * secondary. When a sub-score is insufficientData (most commonly market
 * risk, before enough price history exists), its weight is dropped and the
 * remaining weights are renormalized proportionally so they still sum to
 * 100 — never silently treated as 0 risk.
 */
export const RISK_WEIGHTS: Record<RiskDimensionKey, number> = {
  market: 25,
  debt: 20,
  liquidity: 15,
  credit: 15,
  currency: 10,
  inflation: 10,
  interestRate: 5,
};

export function overallRiskScore(subScores: AnyRiskSubScore[]): number | null {
  const available = subScores.filter((s): s is RiskSubScore => !isInsufficientRiskSubScore(s));
  if (available.length === 0) return null;
  const totalWeight = available.reduce((sum, s) => sum + RISK_WEIGHTS[s.key], 0);
  if (totalWeight === 0) return null;
  const weightedSum = available.reduce((sum, s) => sum + s.score * RISK_WEIGHTS[s.key], 0);
  return weightedSum / totalWeight;
}
