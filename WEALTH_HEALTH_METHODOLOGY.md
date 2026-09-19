# Wealth Health Score Methodology (Phase 20)

This document is the single source of truth for how RicherWealth computes
its 0–100 Wealth Health Score. It exists so the scoring is **transparent
and explainable, never a black box** — every number below has a
corresponding constant in `apps/api/src/wealth/wealth-health-scoring.ts`,
and the two are meant to be read side by side. If this document and the
code ever disagree, the code's inline comments win and this file is out of
date — please open an issue.

This is the direct sibling of `RISK_METHODOLOGY.md` (Phase 12) — same
"pure scoring functions + documented weights + insufficientData/
renormalization handling" shape — but a **separate document**, not a
merged one, because the two use **opposite scale orientations** (see
below) and merging them risks confusing which convention applies where.

## Scale and orientation

Every sub-score is **0–100, where 100 = HEALTHIEST**. This is the
**opposite** convention from `RISK_METHODOLOGY.md` (where 100 = highest
risk) — chosen because "Wealth Health Score" should read naturally with a
bigger number meaning better, the same way a credit score does.

Every sub-score maps to a four-level label using the same thresholds:

| Score range | Level          |
|-------------|----------------|
| 0 – 39.99   | Critical       |
| 40 – 59.99  | Needs Attention|
| 60 – 79.99  | Good           |
| 80 – 100    | Excellent      |

## The six dimensions

### 1. Diversification (weight 20)

**Input:** `AnalyticsService.getAllocation(userId).overallDiversificationScore`
(Phase 11), already 0–100 with 100 = best.

**Formula:** `score = clamp(overallDiversificationScore, 0, 100)` — a direct
passthrough, no rescaling. Phase 11's diversification score already uses
the SAME 100=best convention as this composite, unlike every risk
sub-score, which needs inverting (see #2).

### 2. Risk Profile (weight 20)

**Input:** `RiskEngineService.getRiskProfile(userId).overallScore` (Phase
12), 0–100 with 100 = RISKIEST, or `null` if insufficient data.

**Formula:** `score = clamp(100 - overallRiskScore, 0, 100)`

**Why the inverted Phase-12 composite, not a re-derived one:** reusing the
one real risk number — already itself a weighted composite of market,
debt, liquidity, credit, currency, inflation, and interest-rate risk —
avoids double-counting those same seven inputs under a second,
independently-tuned set of weights. If Phase 12 is `insufficientData` (no
risk profile computable yet), this dimension is `insufficientData` too, not
guessed.

### 3. Savings Rate (weight 20)

**Inputs:** `monthlyIncome` (`IncomeService.getMonthlyPassiveIncome(userId)
.monthlyAmount` — despite the method's name, it sums EVERY active
recurring `Income` entry including `SALARY`, so this is the user's real
total monthly income, not just passive income) and `avgMonthlyExpense`
(`TransactionsService.getAverageMonthlyExpense(userId, 3)`, or `null` if
there's no expense history yet).

**Formula:**
```
savingsRatePct = (monthlyIncome - avgMonthlyExpense) / monthlyIncome * 100
score = clamp(savingsRatePct / 20 * 100, 0, 100)
```

**Why 20%:** a commonly cited "good" personal-finance savings-rate target.
0% or negative (spending at or above income) floors the score at 0; 20%+
caps it at 100; linear in between.

**insufficientData when:** `monthlyIncome <= 0` (no recurring income
recorded) OR `avgMonthlyExpense === null` (no transaction history yet) —
both are needed to compute a real rate, so neither is guessed at.

### 4. Tax Efficiency (weight 15)

**Inputs:** `totalHarvestableLoss` (sum of `abs(unrealizedLoss)` across
`HarvestingService.getHarvestCandidates(userId, countryCode)` — Phase 15's
existing tax-loss-harvest scan, not re-derived) and `totalAssets`
(`NetWorthService.calculateNetWorth(userId).totalAssets`).

**Formula:**
```
harvestablePct = clamp(totalHarvestableLoss / totalAssets * 100, 0, 100)
score = clamp(100 - harvestablePct / 10 * 100, 0, 100)
```

**Why 10%:** if a full 10% of the portfolio's value sits in unrealized,
un-harvested losses, that's treated as maximally tax-inefficient (score 0);
0% left on the table is fully efficient (score 100).

**insufficientData when:** `totalAssets <= 0` (no assets recorded yet).

### 5. Goal Progress (weight 15)

**Input:** `GoalsService.findAll(userId)`'s `percentComplete` for every
active goal (already 0–100 each, computed by Phase 13).

**Formula:** `score = average(percentComplete across all active goals)`

**insufficientData when:** the user has zero active goals — a portfolio
with no goals set isn't "0% toward its goals," it simply has no goals to
measure, so this dimension drops out of the composite entirely rather than
dragging the overall score down.

### 6. Insurance Adequacy (weight 10)

**Inputs:** `insuranceValue` (sum of `Asset.currentValue` where
`type = INSURANCE`, base-currency-converted) and `annualIncome`
(`IncomeService.getMonthlyPassiveIncome(userId).monthlyAmount * 12`).

**Formula:**
```
target = annualIncome * 10
coverageRatio = insuranceValue / target
score = clamp(coverageRatio * 100, 0, 100)
```

**Why 10x annual income:** a common term-life coverage rule of thumb.

**This is explicitly a COVERAGE-AMOUNT PROXY, not a real adequacy
calculation.** There is no dedicated `Insurance` data model in this
app — only `AssetType.INSURANCE`, a bucket in the existing asset-allocation
breakdown. A real adequacy calculation would need premium amounts, policy
type (term vs. whole-life vs. health), dependents count, and existing
employer coverage — none of which exist in the current schema. Building
that data model is out of scope for this pass; this proxy is honestly
labeled as such in the sub-score's `explanation` text, never presented as
more precise than it is.

**insufficientData when:** `annualIncome <= 0` (no income recorded, so
there's no income-based target to measure coverage against).

## Composite overall score

```
WEALTH_HEALTH_WEIGHTS = {
  diversification: 20,
  risk:             20,
  savingsRate:      20,
  taxEfficiency:    15,
  goalProgress:     15,
  insurance:        10,
}   // sums to 100
```

**Why these weights:** diversification and risk profile each anchor the
composite at 20 — the two broadest, most-studied determinants of realized
long-run investment outcomes. Savings rate also gets 20, reflecting that
it's the single biggest lever a user directly controls month to month
(unlike market returns). Tax efficiency and goal progress each get 15 —
real and actionable, but narrower in scope than the first three. Insurance
gets the smallest weight, 10, reflecting both its typically smaller role in
realized wealth outcomes AND the documented approximation in how it's
computed (see #6).

**Handling missing data.** Any sub-score can come back `insufficientData`
(a brand-new portfolio with no risk profile yet, no goals set, no expense
history, etc. — see each dimension above for its own trigger). When that
happens:

- that dimension is **excluded entirely** from the composite, never
  silently treated as 0 or 100;
- the remaining weights are **renormalized proportionally** so they still
  sum to 100%, exactly the same mechanism as `RISK_METHODOLOGY.md`'s
  composite;
- if *every* dimension is `insufficientData`, the overall score is `null`,
  not 0 — the frontend renders an explicit "not enough data yet" state
  rather than a misleadingly alarming "0/100 wealth health."

## Reproducibility (the acceptance-criterion proof)

Because every function in `wealth-health-scoring.ts` is a pure function of
plain numbers (no Prisma, no HTTP, no wall-clock, no randomness), the
overall score is **exactly reproducible** from the same six sub-score
inputs, every time. `wealth-health-scoring.spec.ts` is the literal proof:
it feeds a fixed synthetic set of inputs through the real scoring
functions, hand-computes the expected weighted composite by the formula
above, and asserts they match to floating-point precision — with zero
database, network, or LLM involvement.

## Where this is implemented

- **Pure scoring math** (no I/O, fully unit-testable against fixed
  synthetic inputs): `apps/api/src/wealth/wealth-health-scoring.ts`, tested
  in `wealth-health-scoring.spec.ts`.
- **Data assembly** (querying every source module above):
  `apps/api/src/wealth/wealth-health.service.ts`, tested end-to-end against
  a synthetic portfolio in `wealth-health.service.spec.ts`.
- **API:** `GET /api/wealth/health-score` (sub-scores + overall score,
  cached 6h — mirrors `RiskEngineService`'s Redis-with-in-memory-fallback
  pattern exactly — `?refresh=true` to force recomputation), writing a
  `WealthHealthSnapshot` row on every fresh computation (mirrors
  `RiskScoreSnapshot`).
- **Frontend:** `/wealth/health-score` page — a 6-dimension gauge/radar
  (visually mirroring `/risk`'s existing radar) plus the plain-language
  `explanation` sentence from each sub-score, generated server-side so
  there's one source of truth.
