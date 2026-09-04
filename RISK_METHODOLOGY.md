# Portfolio Risk Scoring Methodology (Phase 12)

This document is the single source of truth for how RicherWealth computes
its portfolio risk scores. It exists so the scoring is **transparent and
explainable, never a black box** — every number below has a corresponding
constant in `apps/api/src/risk/risk-scoring.ts`, and the two are meant to be
read side by side. If this document and the code ever disagree, the code's
inline comments win and this file is out of date — please open an issue.

## Scale and orientation

Every sub-score is **0–100, where 100 = highest risk**. This is the
opposite convention from Phase 11's diversification score (where 100 =
best/most-diversified) — chosen deliberately because a "risk radar chart"
reads naturally with a bigger shape meaning more risk.

Every sub-score maps to a four-level label using the same thresholds:

| Score range | Level      |
|-------------|------------|
| 0 – 24.99   | Low        |
| 25 – 49.99  | Moderate   |
| 50 – 74.99  | Elevated   |
| 75 – 100    | High       |

## The seven dimensions

### 1. Liquidity Risk

**Input:** % of total assets held as `CASH`.

**Formula:** `score = clamp(100 * (1 - cashPercent / 15), 0, 100)`

**Why 15%:** a common personal-finance rule-of-thumb "liquid reserve"
target. Risk falls linearly to 0 as cash reaches 15% of the portfolio; it's
capped at 100 for a fully illiquid (0% cash) portfolio, and floored at 0 for
anything at or above the target (extra cash beyond the target isn't treated
as *more* liquidity risk — that's an opportunity-cost question, out of
scope here).

**Known simplification:** this uses cash *percentage of assets*, not the
stricter "N months of expenses covered" emergency-fund test the Dashboard
uses elsewhere (Phase 2/10) — the feature spec explicitly asked for
"liquidity data (cash %)" as the input.

### 2. Debt Risk

**Input:** `debtRatio` = totalLiabilities / totalAssets (from
`NetWorthService`, Phase 9's loan-intelligence data feeds into this).

**Formula:** `score = clamp(debtRatio / 0.75 * 100, 0, 100)`

**Why 0.75:** references the same thresholds the Dashboard already uses to
color-code `debtRatio` (`net-worth.service.ts` / dashboard page): ≤30% =
good, ≤50% = moderate, >50% = high. This linear scale puts a 30% debt ratio
at 40 (moderate), a 50% ratio at ~66.7 (elevated — roughly where the
dashboard's own amber-to-red cutoff sits), and caps at 100 for a 75%+ ratio
(near-insolvent).

### 3. Inflation Risk

**Inputs:** `inflationExposedPercent` (% of total assets in `CASH` + `BOND`
— holdings with a fixed nominal value that inflation directly erodes) and
`currentInflationPct` (current YoY CPI inflation, from FRED).

**Formula:**
```
multiplier = clamp(currentInflationPct / 2.0, 0.5, 2.0)
score = clamp(inflationExposedPercent * multiplier, 0, 100)
```

**Why 2%:** the inflation target most central banks (US Fed, RBI, etc.)
publicly target. `multiplier = 1.0` exactly at that target, floored at 0.5×
(so very low/deflationary readings can't zero the score out) and capped at
2.0× (so a single extreme CPI print can't blow the score past 100 on its
own).

**Data source:** FRED series `CPIAUCSL`, requested with `units=pc1` so FRED
itself returns the year-over-year percent change — see
`apps/api/src/risk/macro-data.service.ts`. Falls back to a hardcoded ~3.5%
if `FRED_API_KEY` is unset or the fetch fails, same pattern as Phase 11's
`RiskFreeRateService`.

### 4. Currency Risk

**Inputs:** `foreignCurrencyPercent` (% of total assets in a currency other
than the user's base currency, from `NetWorthService.currencyExposure`) and
the dominant foreign currency (for the explanation sentence).

**Formula:** `score = clamp(foreignCurrencyPercent, 0, 100)` — a direct 1:1
mapping, no multiplier.

**Why no multiplier:** any scaling factor here would be an unjustified
guess dressed up as precision. The percentage of the portfolio exposed to
FX movement *is* the risk being measured; inventing a coefficient to make
it feel more sophisticated would make the score less transparent, not more.
This also matches the feature spec's own example almost verbatim: "60% of
your assets are in USD while your expenses are in INR" → currency risk
score of 60.

### 5. Market Risk

**Inputs (from Phase 11's `AnalyticsService.getRiskMetrics`):**
`volatility` (annualized std. dev. of portfolio returns), `beta` (vs. the
benchmark), `maxDrawdown` (historical peak-to-trough decline, or `null` if
there isn't enough price history yet).

**Formula:**
```
volatilityScore = clamp(volatility / 0.30 * 100, 0, 100)
betaScore       = clamp(beta / 2.0 * 100, 0, 100)
drawdownScore   = clamp(|maxDrawdown| / 0.50 * 100, 0, 100)   // when available

score = 0.4 * volatilityScore + 0.3 * betaScore + 0.3 * drawdownScore
```

**Why these anchors:**
- **30% annualized volatility → 100.** Roughly single-stock/crypto-level
  volatility; a diversified equity index typically runs 15-18%.
- **Beta of 2.0 → 100.** Twice as volatile as the benchmark. Beta of 1.0
  (matches the market) sits at the midpoint, 50.
- **50% max drawdown → 100.** A peak-to-trough decline that severe is
  bear-market/crypto-crash territory, not routine volatility.

**When drawdown is unavailable** (not enough price history for a reliable
reading), its 30% weight is dropped and the remaining two are renormalized
proportionally: `score = 4/7 * volatilityScore + 3/7 * betaScore` (i.e.
40/(40+30) and 30/(40+30) of the original weights). If *no* risk metrics
are available at all (Phase 11 returns `insufficientData`), Market Risk is
marked `insufficientData` rather than guessed — see "Handling missing data"
below.

### 6. Interest-Rate Risk

**Inputs:** `variableDebtPercent` (% of total outstanding debt in
`CREDIT_CARD` + `PERSONAL_LOAN` liabilities) and `currentShortRatePct` (the
3-Month T-Bill rate, FRED series `DGS3MO`, reused from Phase 11's
`RiskFreeRateService`).

**Formula:**
```
macroScore = clamp(currentShortRatePct / 8.0 * 100, 0, 100)
score = clamp(0.6 * variableDebtPercent + 0.4 * macroScore, 0, 100)
```

**Known simplification — loan type as a fixed/variable proxy.** The
`Liability` schema has no explicit fixed/variable-rate flag. This uses loan
**type** as a documented stand-in: mortgages, car loans, and education
loans are treated as fixed-rate; credit cards and personal loans are
treated as variable/revolving-rate. This is a reasonable generalization for
most consumer lending, but it is a simplification, not a guarantee — a
fixed-rate personal loan would be mis-classified here.

**Why 8% for the macro anchor:** meaningfully above the ~5.5% 2023 US Fed
Funds peak, leaving headroom so typical current short-term rates (4-6%)
land mid-scale rather than pinned to the ceiling.

### 7. Credit Risk

**Input:** `creditExposedPercent` — a single combined percentage assembled
in `risk-engine.service.ts` as:

```
bondCreditContribution = bondPercent * (corporateShare * 0.6
                                       + municipalShare * 0.3
                                       + govtShare * 0.05)
creditExposedPercent = bondCreditContribution + p2pLendingPercent * 1.0
```

where `bondPercent`/`p2pLendingPercent` are % of total assets (from
`NetWorthService.assetAllocation`, correctly base-currency-converted), and
`corporateShare`/`municipalShare`/`govtShare` are the proportions *within*
the user's bond holdings by `BondType` (`CORPORATE`/`MUNICIPAL` vs.
`GOVT`/`SGB`), from a direct query of `BondHolding` rows.

**Formula:** `score = clamp(creditExposedPercent / 25 * 100, 0, 100)`

**Why these issuer weights:** corporate bonds (0.6) and P2P lending (1.0)
carry real counterparty-default risk; government/sovereign-guaranteed
bonds (GOVT, SGB — 0.05) carry only a small residual weight (sovereign
default is rare but not literally impossible); municipal bonds (0.3) sit in
between. **Why 25% for the anchor:** most diversified portfolios keep
credit-risk-bearing instruments well under a quarter of total assets, so
exceeding that meaningfully concentrates default risk.

**This is deliberately distinct from Debt Risk.** Debt Risk measures the
user's *own* leverage (how much they've borrowed). Credit Risk measures
default risk in what the user *holds* (whether an issuer or borrower they've
lent to might not pay them back). A portfolio can score high on one and low
on the other.

**Known simplification:** bond-type *proportions* are computed from
native-currency `currentValue` sums (not converted to base currency) —
acceptable because only the relative split between bond types is needed
here, not an absolute value; the absolute `bondPercent` it's applied to
already comes from the correctly base-currency-converted
`NetWorthService.assetAllocation`.

## Composite overall score

```
RISK_WEIGHTS = {
  market:       25,
  debt:         20,
  liquidity:    15,
  credit:       15,
  currency:     10,
  inflation:    10,
  interestRate:  5,
}   // sums to 100
```

**Why these weights:** market risk (day-to-day value swings) and debt risk
(leverage/solvency) are the two dimensions most correlated with realized
bad outcomes for a typical investor, so they carry the most weight. The
remaining five are all meaningful but secondary.

**Handling missing data.** Any sub-score can come back `insufficientData`
(most commonly Market Risk, before there's enough price history to compute
volatility/beta/drawdown — see Phase 11's own graceful-degradation
pattern). When that happens:

- that dimension is **excluded entirely** from the composite, never
  silently treated as 0 risk or 100 risk;
- the remaining weights are **renormalized proportionally** so they still
  sum to 100%. Example: if Market Risk (weight 25) is unavailable, the
  remaining 75 points of weight are redistributed proportionally across
  the other six dimensions, and the overall score is the weighted average
  over just those six.
- if *every* dimension is `insufficientData` (a brand-new portfolio with no
  data at all), the overall score is `null`, not 0 — the frontend renders
  an explicit "not enough data yet" state rather than a misleadingly
  reassuring "0% risk."

## Where this is implemented

- **Pure scoring math** (no I/O, fully unit-testable against fixed
  synthetic inputs): `apps/api/src/risk/risk-scoring.ts`, tested in
  `risk-scoring.spec.ts`.
- **Data assembly** (querying Postgres via `NetWorthService`/
  `LiabilitiesService`, calling Phase 11's `AnalyticsService`, fetching
  FRED via `RiskFreeRateService`/`MacroDataService`):
  `apps/api/src/risk/risk-engine.service.ts`, tested end-to-end against
  synthetic low-risk and high-risk portfolios in
  `risk-engine.service.spec.ts`.
- **API:** `GET /api/risk/profile` (sub-scores + overall score, cached 6h,
  `?refresh=true` to force recomputation), `GET /api/risk/trend` (last 12
  months of daily snapshots, written automatically on every fresh
  computation).
- **Frontend:** `/risk` page — radar chart, plain-language explanation
  cards (the exact sentences from each sub-score's `explanation` field,
  generated server-side so there's one source of truth), and a historical
  trend chart.
