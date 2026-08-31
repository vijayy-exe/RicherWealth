# RicherWealth — Phase-by-Phase Build Prompts

A self-contained prompt for every phase of the roadmap. Copy one phase's prompt into your AI coding tool (Claude Code, Cursor, etc.), let it finish and pass its acceptance checks, commit, then move to the next phase. Each prompt is written to stand alone, but phases build on each other in order — don't skip ahead.

---

## How to use this document

1. **Create the project once**, then save the *Master Project Context* block below as `PROJECT_CONTEXT.md` in the repo root. Point your coding agent at it at the start of every session ("read PROJECT_CONTEXT.md before doing anything").
2. **Work one phase at a time.** Paste that phase's prompt as-is (edit only if your stack choices differ). Each prompt lists its own acceptance criteria — don't move on until those pass.
3. **Commit after every phase** (`git commit -m "Phase N: <name>"`). This gives you a clean rollback point and lets the agent diff against a known-good state next session.
4. **Re-paste PROJECT_CONTEXT.md's summary** at the start of each new phase's prompt if your tool doesn't have persistent memory across sessions — each phase prompt below already includes a short "context recap" line for this reason.
5. **Free-tier API keys**: get them once, up front, and store in `.env` (see Appendix B). Nothing below requires a paid key to build; upgrade paths are noted where relevant.

---

## Master Project Context — save as `PROJECT_CONTEXT.md`

```
PROJECT: RicherWealth — AI-powered personal/family wealth operating system

CORE PHILOSOPHY: Most finance apps answer "what do I own?" — this app answers
"what should I do next to maximize my wealth?"

STACK:
- Frontend: React 19 + Next.js 15 (App Router) + TypeScript
- Styling: Tailwind CSS + shadcn/ui + Framer Motion (glassmorphism, animated cards)
- Charts: Recharts + Apache ECharts (heatmaps, correlation matrices)
- State/data: TanStack Query (server state) + Zustand (client state)
- Forms: React Hook Form + Zod
- Tables: AG Grid for large holdings/transaction lists
- Maps: Leaflet/OpenStreetMap (free) for real estate
- Backend: Node.js + NestJS, modular (one module per domain: assets, liabilities,
  income, expenses, analytics, ai, auth, etc.)
- DB: PostgreSQL + Prisma ORM
- Cache/queues: Redis + BullMQ
- API style: GraphQL for dashboard queries, REST for webhooks/integrations
- Realtime: WebSockets for live prices / net worth ticks
- Quant microservice: Python + FastAPI (numpy/pandas/scipy) for Sharpe/Sortino/
  Monte Carlo — called internally from NestJS
- AI layer: Claude/OpenAI API for reasoning + Ollama (local LLM) as free fallback
  for privacy-sensitive analysis; pgvector for RAG over user data
- Auth: Supabase Auth or Auth.js, WebAuthn passkeys, MFA
- Storage: Supabase Storage / Cloudflare R2 (free tiers) for documents
- Hosting: Vercel (frontend) + Render/Fly.io (backend), free tiers to start

DATA MODEL PRINCIPLES:
- Every asset class is a row in an `assets` table with a `type` discriminator
  and a `details` JSONB column for type-specific fields, PLUS dedicated tables
  for high-volume types (stocks, mutual_funds, crypto) that need price history.
- Every monetary value stored with an explicit currency code; a base-currency
  conversion happens at read-time via the forex service, never at write-time.
- All external API calls go through a caching layer (Redis) — never call a
  free-tier API directly from a request handler.

CODING CONVENTIONS:
- TypeScript strict mode everywhere.
- One NestJS module per business domain, each with its own Prisma models,
  service, controller/resolver, and DTOs.
- Every new asset/data type gets a Zod schema shared between frontend and
  backend via a shared package (`packages/shared-types`).
- Tests: Jest for units, Playwright for E2E — write tests alongside each
  phase, not retroactively.

CURRENT PHASE: [update this line each time you start a new phase]
```

---

## Phase 0 — Planning, Architecture & UX Design

**Context recap:** Greenfield project, nothing built yet.

**Prompt:**
```
Set up the RicherWealth monorepo from scratch. Read PROJECT_CONTEXT.md for stack
and conventions before starting.

1. Initialize a Turborepo (or Nx) monorepo with:
   - apps/web (Next.js 15 + React 19 + TypeScript)
   - apps/api (NestJS + TypeScript)
   - apps/quant (FastAPI, Python — stub only for now)
   - packages/shared-types (Zod schemas + TS types shared across apps)
   - packages/ui (shadcn/ui-based component library, empty for now)
2. Configure ESLint, Prettier, and TypeScript strict mode across all packages.
3. Set up a Prisma schema in apps/api with placeholder models: User, Asset,
   Liability, Transaction (fields TBD in later phases — just get migrations
   running against a local PostgreSQL instance via docker-compose).
4. Add a docker-compose.yml with Postgres and Redis services for local dev.
5. Set up GitHub Actions CI: lint + typecheck + test on every PR (free tier).
6. Create a design-tokens file (colors, spacing, typography, radii) matching
   a modern glassmorphism fintech aesthetic — dark-mode-first, high contrast
   for numbers, one accent color for "gains" (green) and one for "losses" (red).
7. Write PROJECT_CONTEXT.md into the repo root using the Master Project
   Context block, and a README with setup instructions.

Acceptance criteria:
- `pnpm install && docker-compose up && pnpm dev` boots web on :3000 and api on :4000
- CI passes on an empty commit
- Prisma migration runs cleanly against local Postgres
```

---

## Phase 1 — Foundation: Auth, DB & Core Infra

**Context recap:** Monorepo scaffolded, empty Prisma schema, CI green.

**Prompt:**
```
Build authentication and the core user/session infrastructure for RicherWealth.
Read PROJECT_CONTEXT.md first.

1. Integrate Supabase Auth (or Auth.js if you prefer full self-hosting) into
   apps/web and apps/api: email+password signup/login, email OTP verification,
   Google social login, and WebAuthn passkey support.
2. Add MFA (TOTP) as an optional account setting.
3. Extend the Prisma schema: User (id, email, name, baseCurrency, mfaEnabled,
   createdAt), Session, and a Household model (for future Family Office mode —
   just the FK relationships for now, no UI).
4. Implement RBAC: role enum (OWNER, MEMBER, VIEWER) scoped per Household,
   enforced via NestJS guards.
5. Build the onboarding flow UI: welcome screen → base currency selection →
   "what do you want to track first" quick-pick (stocks/real estate/crypto/etc,
   used only to personalize the empty-state dashboard later) → done.
6. Build account settings page: profile, security (MFA, passkeys, sessions
   list with revoke), currency preference.
7. Store secrets/env vars per Appendix B of the build-prompts doc.

Acceptance criteria:
- New user can sign up, verify email, log in, enable MFA, and log in with MFA
- Passkey registration and passkey login both work
- Protected API routes reject requests without a valid session
- Onboarding flow completes and persists baseCurrency to the User record
```

---

## Phase 2 — Dashboard Shell & Net Worth Engine

**Context recap:** Auth works, users can log in and land on an empty dashboard.

**Prompt:**
```
Build the home dashboard shell and the net worth calculation engine.
Read PROJECT_CONTEXT.md first. No real asset data exists yet — build against
mocked/seeded data, but the calculation logic must be real and reusable once
Phase 3 adds real assets.

1. Backend: a NetWorthService in apps/api that sums all Asset.currentValue
   (converted to baseCurrency) minus all Liability.remainingBalance, and
   exposes: current net worth, net worth 24h ago, net worth 30 days ago,
   net worth 1 year ago (from a NetWorthSnapshot table you create, written by
   a nightly cron job).
2. GraphQL query `dashboardSummary` returning: totalNetWorth, todayChange
   (abs + %), monthChange, yearChange, assetAllocation (by top-level category),
   emergencyFundHealth (placeholder logic), debtRatio.
3. Frontend dashboard page with: animated glassmorphism summary cards (net
   worth, today's gain/loss, monthly growth, annual growth) using Framer
   Motion for count-up animations; an asset allocation donut chart and a net
   worth trend line chart (Recharts); a well-designed empty state prompting
   the user to add their first asset when they have none.
4. WebSocket channel that pushes live net-worth deltas to the dashboard
   (stub the price feed for now — this phase is about the plumbing).
5. Seed script that creates realistic demo data for local development/testing.

Acceptance criteria:
- Dashboard renders correctly with zero assets (empty state) and with seeded
  demo data (full cards + charts)
- dashboardSummary query returns correct math against seeded data (write a
  Jest test with known inputs/outputs)
- Cards animate on load and update live when NetWorthSnapshot changes
```

---

## Phase 3 — Manual Asset & Liability Entry (All Classes)

**Context recap:** Dashboard shell works against seed data; now make it work against real user-entered data.

**Prompt:**
```
Build full CRUD for every asset and liability type in the spec, entered
manually (no external API sync yet — that starts in Phase 4).
Read PROJECT_CONTEXT.md first.

Asset types to support (each with its own Zod schema in packages/shared-types):
Cash & bank accounts, Fixed Deposits/CDs, Retirement accounts (401k/IRA/NPS/
EPF/PPF/Superannuation), Insurance (life/health/vehicle/home/travel/ULIP —
track premium, coverage, nominee, renewal date), Vehicles, Collectibles
(watches/art/cars/coins/sneakers), NFTs, Business equity/private company
shares, Real estate (residential/commercial/agricultural/rental/land/plots —
purchase price, current estimate, loan-linked ROI).

Liability types: education loan, car loan, mortgage, credit card, personal
loan — each with principal, interest rate, EMI, remaining balance, due date.

1. Extend Prisma schema: a generic Asset table (id, userId, type, name,
   currency, currentValue, details JSONB, createdAt, updatedAt) plus a
   Liability table with equivalent structure.
2. Build a dynamic form system: one React Hook Form + Zod schema per asset
   type, rendered through a shared <AssetForm type={...} /> component so
   adding a new asset type later doesn't require new form plumbing.
3. Asset list views: a filterable/sortable AG Grid table per top-level
   category (Investments, Real Estate, Retirement, Insurance, etc.) and a
   unified "All Assets" view.
4. File upload for supporting documents (receipts, deeds, policy PDFs) using
   Supabase Storage or Cloudflare R2 — attach to the relevant asset record.
5. Wire real asset data into the NetWorthService from Phase 2, replacing the
   seed-only calculation.
6. Liability entry forms + list, wired into the debtRatio calculation.

Acceptance criteria:
- User can add, edit, delete an instance of every listed asset and liability
  type
- Uploaded documents are retrievable and access-controlled per user
- Dashboard net worth updates correctly when assets/liabilities are added
- AG Grid views support sort/filter/search on at least 500 seeded rows
  without perf issues
```

---

## Phase 4 — Stocks & Global Market Data Integration

**Context recap:** Manual assets work end-to-end; now add live-synced stock holdings.

**Prompt:**
```
Add stock holdings with live market data. Read PROJECT_CONTEXT.md first.

1. New Stock model: ticker, exchange (NSE/BSE/NYSE/NASDAQ/LSE/HKEX), quantity,
   avgBuyPrice, currency — linked 1:1 with the generic Asset row (type="stock").
2. Build a PriceSyncService in apps/api:
   - Primary source: Alpha Vantage (free, 25 req/day) for global tickers
   - Fallback: Finnhub (free, 60 calls/min) or Twelve Data (free, 800/day)
   - India NSE/BSE: jugaad-data or nsepython (unofficial, free)
   - Cache every price in Redis with a TTL matched to free-tier rate limits
     (e.g., 15 min during market hours); never call the provider directly
     from a user-facing request.
   - A BullMQ scheduled job refreshes prices for all actively-held tickers.
3. Compute and expose per-holding: live price, day change, P/E, EPS, CAGR
   since purchase, dividend yield, a simple intrinsic-value estimate (e.g.,
   Graham formula) and a fair-value flag (over/under/fair).
4. Frontend: stock holdings table (AG Grid) with live-updating price column
   (WebSocket push from the sync job), an add-holding flow with ticker
   autocomplete/search, and a watchlist feature separate from holdings.
5. Handle provider failures gracefully — show "price stale" state rather than
   breaking the UI, and log fallback-provider usage for monitoring.

Acceptance criteria:
- Adding a real ticker (e.g., AAPL, RELIANCE.NSE) fetches and displays a live
  price within the cache TTL
- Rate-limit exhaustion on the primary provider correctly falls back to the
  secondary without user-visible errors
- Net worth and asset allocation update to reflect live stock prices
- A unit test proves the intrinsic-value formula against a known example
```

---

## Phase 5 — Mutual Funds, ETFs & Bonds

**Context recap:** Stocks are live-synced; extend the same pattern to funds and bonds.

**Prompt:**
```
Add mutual funds, ETFs, and bonds. Read PROJECT_CONTEXT.md first.

1. New models: MutualFundHolding (fund code, SIP or lumpsum, unitsHeld,
   avgNAV), ETFHolding (reuses the stock pricing pipeline since ETFs trade
   like stocks), BondHolding (issuer, type [govt/corporate/municipal/SGB],
   faceValue, couponRate, maturityDate).
2. NAV sync for India mutual funds via MFAPI.in (free, no key) — daily job.
   For global funds/ETFs, reuse the Phase 4 price pipeline.
3. Compute per mutual-fund-holding: current value, XIRR (implement
   Newton-Raphson in a shared calculation service — write this once, reuse it
   for SWP/goal calculators later), CAGR, expense ratio (static, entered by
   user or looked up), NAV history chart.
4. SIP tracking: recurring-investment entries that roll up into the XIRR
   calculation correctly (each SIP installment is its own cash flow).
5. Portfolio overlap and rolling-returns are nice-to-have in this phase —
   stub the UI with "coming soon" if provider data isn't available, don't
   fake numbers.
6. Frontend: mutual fund holdings list with NAV trend sparklines, SIP entry
   form with frequency (monthly/quarterly), bond holdings list with
   maturity/coupon display.

Acceptance criteria:
- XIRR calculation matches a known reference value (write a Jest test with a
  textbook SIP cash-flow example)
- NAV sync job populates historical NAV correctly for at least one real India
  mutual fund code
- Net worth reflects mutual fund and bond values correctly
```

---

## Phase 6 — Crypto Integration

**Context recap:** Traditional investment types are live; add crypto using the same pricing-pipeline pattern.

**Prompt:**
```
Add cryptocurrency holdings. Read PROJECT_CONTEXT.md first.

1. New CryptoHolding model: coinId (CoinGecko ID), quantity, avgBuyPrice,
   currency, optional walletAddress (read-only tracking, no private keys ever
   stored or requested).
2. Price sync via CoinGecko API (free, no key for basic public endpoints,
   10-30 calls/min) with CoinCap as a free fallback — same Redis-cache +
   BullMQ pattern as Phase 4.
3. Support at minimum BTC, ETH, SOL, and searchable access to CoinGecko's
   full coin list for "all major exchanges" coverage.
4. Frontend: crypto holdings table with live price + 24h change, add-holding
   flow with coin search/autocomplete, portfolio P&L per coin and aggregate.
5. Price alert stub: let users set a target price per coin (full alert
   delivery comes in Phase 17 — for now just persist the alert config).

Acceptance criteria:
- Adding BTC/ETH/SOL holdings fetches live prices correctly
- Coin search returns accurate results from CoinGecko's coin list
- Net worth and asset allocation correctly include crypto value
- Provider fallback (CoinGecko → CoinCap) tested and working
```

---

## Phase 7 — Commodities, Forex & Precious Metals

**Context recap:** Crypto done. Add commodities/metals and build the multi-currency conversion layer the whole app depends on.

**Prompt:**
```
Add commodities, precious metals, and forex holdings, and build the
base-currency conversion service used everywhere in the app.
Read PROJECT_CONTEXT.md first.

1. CurrencyService: fetches daily FX rates from Frankfurter.app (free, no
   key, ECB-sourced) with exchangerate.host as fallback, caches in Redis,
   refreshes daily. Expose a convert(amount, from, to) helper used by every
   other service that aggregates money (NetWorthService, analytics, etc.) —
   go back and refactor Phases 2-6 to use this service if they aren't
   already converting correctly.
2. Gold/Silver: physical, digital, ETF, and jewellery sub-types under a
   PreciousMetal model; live spot price via GoldAPI.io or metals-api.com
   (free tiers) with manual weight/purity entry for physical holdings.
3. Commodities (oil, natural gas, wheat, coffee, corn, copper): via Alpha
   Vantage's commodities endpoints (shares the Phase 4 rate-limit budget —
   make sure the caching layer accounts for this).
4. Forex holdings: manual entry of foreign-currency cash positions, valued
   through the CurrencyService.
5. Frontend: metals/commodities holdings UI consistent with earlier asset
   types; a currency-exposure breakdown widget on the dashboard.

Acceptance criteria:
- A holding entered in INR and one entered in USD both roll up correctly
  into the user's baseCurrency net worth figure
- Gold/silver live prices reflect current spot price within cache TTL
- Currency-exposure widget correctly sums holdings by currency
```

---

## Phase 8 — Real Estate & Alternative Assets

**Context recap:** Core investable-asset pricing pipelines are done; now round out illiquid/alternative assets.

**Prompt:**
```
Build out real estate and alternative asset tracking with richer UI than the
generic form from Phase 3. Read PROJECT_CONTEXT.md first.

1. Real estate: residential/commercial/agricultural/rental/land/plots/
   apartments/villas/under-construction — extend the RealEstate details with
   purchase price, current estimate (manual, re-appraised periodically),
   appreciation %, rental yield (if rental), linked Liability (mortgage) for
   ROI-after-debt calculation, address, and lat/lng.
2. Property card UI: photo gallery, key stats, and an embedded map via
   Leaflet + OpenStreetMap (free, no billing risk) showing the property pin;
   note Mapbox (free tier, 50k loads/mo) as a drop-in upgrade if richer
   styling is wanted later.
3. Startup investments, angel investments, private equity, REITs, P2P
   lending: extend the generic Asset details JSONB with type-specific fields
   (round/valuation for startups, units/NAV for REITs, principal/interest/
   tenure for P2P).
4. Collectibles and NFTs: reuse Phase 3's collectibles/NFT forms; add a
   simple manual revaluation history log (append-only) so users can track
   value changes over time even without a pricing API.
5. Real estate ROI calculation: (rental income + appreciation - mortgage
   interest - maintenance) / equity invested, shown per property.

Acceptance criteria:
- Property card renders correctly with and without a linked mortgage
- Map pin displays at the correct address-derived coordinates
- ROI calculation matches a hand-computed example in a unit test
- Alternative asset types persist and roll into net worth correctly
```

---

## Phase 9 — Liabilities & Loan Intelligence

**Context recap:** Basic liability entry exists from Phase 3; now add real loan intelligence.

**Prompt:**
```
Build the loan/liability intelligence layer. Read PROJECT_CONTEXT.md first.

1. Amortization engine (shared service, reused later by the EMI/Mortgage
   calculators in Phase 13): given principal, rate, tenure, and payment
   frequency, generate the full amortization schedule and expose remaining
   balance, interest paid to date, and interest-to-principal ratio at any
   point in time.
2. Prepayment-savings suggestion: given a hypothetical extra payment, show
   interest saved and tenure reduction — this is a pure calculation, no AI
   needed yet.
3. Loan types: education, car, mortgage, credit card (revolving, different
   math — minimum payment + APR rather than amortization schedule), personal
   loan.
4. Frontend: loan detail view with schedule table/chart, a "what if I
   prepay ₹X" interactive slider showing savings in real time, due-date
   tracking feeding into the debtRatio and Phase 17 alerts.
5. Wire loan interest costs into a "debt cost vs investment return" comparison
   widget on the dashboard (foundation for the AI CFO's "your debt costs more
   than your investments earn" insight in Phase 20).

Acceptance criteria:
- Amortization schedule matches a standard loan calculator's output for a
  known test case (principal/rate/tenure) to the cent
- Prepayment slider updates savings figures in real time without a full page
  reload
- Credit card minimum-payment math is correct for a revolving-balance test
  case
```

---

## Phase 10 — Income, Expenses & Banking Sync

**Context recap:** All asset/liability tracking is complete; add cash-flow tracking.

**Prompt:**
```
Build income tracking, expense tracking with auto-categorization, and bank
sync. Read PROJECT_CONTEXT.md first.

1. Income model: source type (salary/business/rental/dividends/royalties/
   freelance/interest/affiliate/YouTube), amount, frequency, currency —
   recurring entries roll up into a monthly passive-income figure for the
   dashboard.
2. Expense model + Transaction model: category (auto-categorization/travel/
   shopping/food/utilities/healthcare/entertainment/subscriptions/bills),
   amount, date, merchant, source (manual/bank-synced).
3. Auto-categorization: start with a rules engine (merchant-name keyword
   matching) before reaching for ML — it's free, fast, and good enough for
   v1; log low-confidence matches for the user to correct, and use those
   corrections to improve the ruleset over time.
4. Bank/UPI/card sync: integrate Plaid Sandbox (free for dev, US/EU) as the
   reference implementation; for India, since open-banking APIs are mostly
   paid, build a manual bank-statement CSV/PDF import as the free-tier path
   and leave a clean adapter interface so a paid Account Aggregator
   integration can be swapped in later without touching the rest of the app.
5. Frontend: cash flow view (income vs expenses over time, Recharts), a
   transaction list with inline re-categorization, subscription detector
   (recurring same-merchant/same-amount transactions flagged automatically).

Acceptance criteria:
- CSV bank statement import correctly parses and categorizes at least 90% of
  a realistic sample statement out of the box
- Plaid Sandbox connection successfully pulls test transactions end-to-end
- Passive income figure on the dashboard matches the sum of recurring income
  entries
- Subscription detector correctly flags a synthetic recurring-charge test
  case
```

---

## Phase 11 — Portfolio Analytics Engine

**Context recap:** All financial data now flows into the system; build the quant layer on top.

**Prompt:**
```
Build the portfolio analytics/quant engine. Read PROJECT_CONTEXT.md first.

1. Stand up the apps/quant FastAPI service properly (was stubbed in Phase 0):
   numpy/pandas/scipy for calculations, called internally from NestJS over
   REST — never exposed directly to the frontend.
2. Implement, with unit tests against known reference values:
   - Allocation & diversification score (by asset class, sector, geography,
     currency, market cap)
   - Beta, Alpha (vs a benchmark index, e.g. S&P 500 or NIFTY 50)
   - Sharpe ratio, Sortino ratio, Treynor ratio (risk-free rate from FRED API,
     free)
   - Standard deviation, max drawdown, volatility
   - Correlation matrix across all holdings
   - Monte Carlo simulation for forward portfolio-value projection
3. Frontend: an Analytics page with allocation breakdowns (multiple pie/
   treemap views), a risk-metrics summary card, a correlation heatmap
   (Apache ECharts), and a Monte Carlo fan chart showing projected value
   ranges.
4. Cache expensive calculations (Monte Carlo especially) — recompute on a
   schedule or on-demand with a loading state, not on every dashboard load.

Acceptance criteria:
- Sharpe/Sortino/Treynor calculations match hand-computed values for a fixed
  test portfolio (write the reference numbers into the test itself)
- Correlation matrix values fall correctly in [-1, 1] and match numpy's
  corrcoef on the same input data
- Monte Carlo simulation completes in under 5 seconds for a 20-holding
  portfolio and renders without blocking the UI thread
```

---

## Phase 12 — Risk Engine

**Context recap:** Analytics engine produces raw metrics; the risk engine turns them into a digestible score.

**Prompt:**
```
Build the portfolio risk-scoring engine. Read PROJECT_CONTEXT.md first.

1. A weighted-scoring RiskEngine service in apps/api that consumes Phase 11's
   analytics output plus liquidity data (cash %), debt data (debtRatio from
   Phase 9), and macro data (inflation/interest rates from FRED API, free) to
   produce sub-scores for: liquidity risk, debt risk, inflation risk,
   currency risk, market risk, interest-rate risk, credit risk.
2. Document the weighting methodology in code comments and in a
   RISK_METHODOLOGY.md file — this must be transparent and explainable, not
   a black box, since it feeds user-facing recommendations later.
3. Frontend: a Risk page with a radar/spider chart across all risk
   dimensions, plain-language explanations under each ("Your currency risk is
   elevated because 60% of your assets are in USD while your expenses are in
   INR"), and historical risk-score trend.

Acceptance criteria:
- Each sub-score is independently unit-testable against a fixed synthetic
  portfolio with known expected risk characteristics
- Risk page renders correctly for a low-risk (mostly cash/bonds) and a
  high-risk (concentrated single-stock) synthetic portfolio, showing visibly
  different scores
```

---

## Phase 13 — Goals & Calculators

**Context recap:** Risk engine complete; add forward-looking planning tools.

**Prompt:**
```
Build the goals module and the full calculator suite. Read
PROJECT_CONTEXT.md first.

1. Goal model: type (House/Marriage/Vacation/Education/Emergency Fund/
   Retirement/Car/Custom), targetAmount, targetDate, currentProgress (linked
   to specific assets or a standalone savings figure).
2. Goal success-probability: reuse the Phase 11 Monte Carlo engine — run the
   simulation against the goal's required savings rate and time horizon,
   report probability of hitting the target. This is a real simulation, not
   a placeholder percentage.
3. Calculator suite (reuse the amortization/XIRR services built in Phases 5
   and 9 wherever applicable, don't duplicate logic): SIP, EMI, Mortgage,
   Retirement, Inflation, Goal Planning, Lumpsum, Compound Interest, SWP, FD,
   RD, Loan Comparison, Tax (basic), Currency.
4. Each calculator: a clean interactive form with real-time result updates as
   inputs change (no submit button needed), a results chart where relevant
   (e.g., SIP growth curve), and a "save as goal" action linking the
   calculation to a new Goal record.
5. Package the calculation logic in packages/shared-types (or a new
   packages/finance-math) so both frontend (instant preview) and backend
   (authoritative calculation) use the identical formulas.

Acceptance criteria:
- Every calculator's output matches a known reference calculation (write
  fixture-based tests for each)
- Goal success-probability changes sensibly when target date or contribution
  amount changes
- Frontend and backend calculation results match exactly for the same inputs
  (regression test)
```

---

## Phase 14 — Market Intelligence & News

**Context recap:** Personal financial engine is complete; add outward-facing market context.

**Prompt:**
```
Build the market intelligence and news module. Read PROJECT_CONTEXT.md first.

1. Live market data widgets: world indices, currencies, crypto, commodities,
   top gainers/losers — reuse the Phase 4/6/7 price-sync infrastructure and
   caching patterns rather than building a parallel system.
2. News aggregation: NewsAPI.org (free, 100 req/day) or GNews.io (free tier)
   as primary, Finnhub's news endpoint as a finance-specific secondary
   source. Deduplicate near-identical headlines across sources. Tag articles
   by relevance to the user's actual holdings (simple keyword match against
   tickers/company names in their portfolio) so the news feed can be
   personalized, not just generic.
3. Economic calendar and macro dashboard: Fed rates, RBI rates, inflation,
   GDP via FRED API (free) and RBI open data (free); IPO calendar can be a
   simpler curated/manual-entry feature if no reliable free IPO-calendar API
   is available — don't fabricate data, note the limitation in the UI if so.
4. Frontend: a Markets page with live tickers, a "News relevant to your
   portfolio" feed prioritized above general market news, and an economic
   calendar widget.

Acceptance criteria:
- News feed correctly prioritizes articles mentioning tickers the user
  actually holds
- Duplicate/near-duplicate headlines from different sources are collapsed
- Market data widgets update on the same caching cadence as the rest of the
  app (no redundant API calls beyond what Phase 4/6/7 already established)
```

---

## Phase 15 — Tax Center

**Context recap:** Add tax-awareness on top of the existing transaction/holdings data.

**Prompt:**
```
Build the tax center. Read PROJECT_CONTEXT.md first.

1. Capital gains calculation: short-term vs long-term, computed from actual
   buy/sell transaction history (requires transaction-level cost-basis
   tracking — extend the Stock/MutualFund/Crypto holding models if lot-level
   tracking isn't already there from earlier phases).
2. Dividend tax tracking from recorded dividend income.
3. Tax-loss harvesting suggestions: identify holdings currently at an unrealized
   loss where realizing it would offset gains elsewhere — a rules-based
   scan, not AI, for this phase.
4. Country-specific tax rules as versioned JSON config (start with US and
   India slabs/rates since those are referenced in the source spec), designed
   so adding a new country is a config change, not a code change.
5. Downloadable tax reports (PDF/CSV) summarizing gains/losses/dividends for
   a selected financial year.

Acceptance criteria:
- Capital gains calculation correctly classifies a test transaction as
  short-term vs long-term based on holding period and computes the right
  gain/loss amount
- Tax-loss harvesting scan correctly identifies a synthetic underwater
  holding as a harvesting candidate
- Generated tax report totals reconcile with the underlying transaction data
```

---

## Phase 16 — Encrypted Document Vault

**Context recap:** Financial engine is feature-complete; add the secure document layer.

**Prompt:**
```
Build the zero-knowledge encrypted document vault. Read PROJECT_CONTEXT.md
first.

1. Client-side AES-256 encryption before any file leaves the browser — the
   server and storage backend (Supabase Storage / Cloudflare R2, free tiers)
   never see plaintext. Derive the encryption key from the user's
   credentials via a secure key-derivation function; document the key-
   recovery tradeoffs clearly in-app (if the user loses their key, what
   happens — be honest about this in the UI copy).
2. Document categories: PAN, Aadhaar, Passport, Insurance, Property
   Documents, Investment Statements, Tax Returns — each linkable to a
   relevant Asset/Insurance/Tax record from earlier phases.
3. Frontend: a vault UI with category folders, drag-and-drop upload, and
   in-browser decrypt-and-preview (PDF/image) without ever sending the
   decrypted file back to the server.

Acceptance criteria:
- Uploading and re-downloading a document round-trips byte-for-byte
  identical to the original
- Inspecting network traffic during upload shows only ciphertext, never
  plaintext file content
- A server-side database dump does not contain any readable document content
```

---

## Phase 17 — Alert & Notification Center

**Context recap:** Add the delivery mechanism for everything the app has learned it should tell users.

**Prompt:**
```
Build the alert and notification center. Read PROJECT_CONTEXT.md first.

1. Alert types (wire each to the relevant data source already built): market
   crash (large index drop), dividend received, loan/premium/EMI/SIP due
   date approaching, stock hits target price (Phase 4/6 alert stubs), property
   price change, crypto price alert.
2. A central rules engine + BullMQ scheduled jobs evaluating alert conditions
   on a sensible cadence per type (price alerts more frequent, due-date
   alerts daily).
3. Delivery channels: in-app notification center (bell icon, read/unread
   state), push via Firebase Cloud Messaging (free), email via Resend or
   SendGrid free tier.
4. Notification preferences UI: per-alert-type channel toggles and quiet
   hours.

Acceptance criteria:
- Triggering each alert type in a test environment produces a notification
  in all enabled channels
- Disabling a channel in preferences correctly suppresses delivery on that
  channel only
- No duplicate notifications fire for the same event across scheduled-job
  runs (idempotency test)
```

---

## Phase 18 — Reports Engine

**Context recap:** Add polished, exportable output for everything the app tracks.

**Prompt:**
```
Build the reports engine. Read PROJECT_CONTEXT.md first.

1. Server-side PDF generation (Puppeteer or React-PDF, both free/open-source)
   for: net worth statement, portfolio analytics summary, tax report (reuse
   Phase 15's data), and a general "financial snapshot" report.
2. Excel/CSV export (ExcelJS, free) for holdings, transactions, and any
   AG Grid table in the app — add a consistent "Export" action pattern
   reusable across pages.
3. Report templates styled to look institutional/professional (real letterhead-
   style layout, not a raw data dump) — this is a differentiator per the
   original spec, so invest real design effort here.
4. AI-written executive summary for each report (a short natural-language
   paragraph) — stub this with a clearly-labeled placeholder if Phase 19's AI
   layer isn't built yet, then wire it for real once Phase 19 lands.

Acceptance criteria:
- Generated PDF opens correctly and matches on-screen data exactly (no
  stale/cached figures)
- CSV/Excel export round-trips correctly into a spreadsheet tool with correct
  column types (numbers as numbers, not strings)
- Report generation completes in under 10 seconds for a realistic portfolio
  size
```

---

## Phase 19 — AI Analyst & AI Chat (Core AI Layer)

**Context recap:** All financial data, analytics, and risk scoring exist; this is where the app becomes genuinely differentiated.

**Prompt:**
```
Build the core AI layer: AI Analyst reports and AI Chat. Read
PROJECT_CONTEXT.md first.

1. RAG pipeline: index the user's assets, transactions, goals, and analytics
   snapshots into pgvector (free, Postgres extension) so the AI can answer
   grounded questions about the user's actual portfolio rather than
   hallucinating numbers.
2. LLM orchestration service: primary via Claude API or OpenAI API
   (pay-per-use after free trial credits — budget for this, it's the one
   phase where "fully free" isn't realistic at production quality); Ollama
   with a local Llama 3 or Mistral model as a zero-cost fallback for
   privacy-sensitive or high-volume/low-stakes queries (e.g., simple
   categorization explanations).
3. Scheduled AI reports: daily ("You gained ₹X today, driven by...") weekly
   (sector exposure shifts), monthly (spending pattern changes), yearly
   (net worth growth summary) — each grounded in real computed deltas from
   the NetWorthSnapshot and analytics data, with the LLM used for the
   natural-language framing, not the underlying numbers.
4. AI Chat: a streaming chat UI where the model can answer portfolio-specific
   questions ("Is my portfolio diversified?", "How much risk am I taking?")
   by querying the RAG index and the analytics/risk services, and general
   questions ("Compare Tesla vs Nvidia") using its own knowledge plus, where
   helpful, the Phase 14 market-data/news services.
5. Suggestion engine: surface Sell/Buy/Rebalance/Tax-harvest/Increase-SIP
   suggestions as structured cards (not just chat text) generated from a
   combination of rules (Phase 11/12/15 outputs) and LLM reasoning — always
   show the underlying data point the suggestion is based on, so it's
   explainable, not a black box.

Acceptance criteria:
- AI Chat correctly answers a factual question about a seeded test
  portfolio's actual holdings (grounding test — no hallucinated numbers)
- Daily AI report generates correctly off a known day-over-day net worth
  change in test data
- Suggestion cards each link back to the specific data (holding, ratio,
  threshold) that triggered them
- Ollama fallback path is tested and produces a usable (if lower-quality)
  response when the primary LLM API is unavailable
```

---

## Phase 20 — Advanced AI Features

**Context recap:** Core AI layer works; build the standout differentiator features on top of it.

**Prompt:**
```
Build the advanced/differentiator AI features. Read PROJECT_CONTEXT.md first.
Each of these reuses infrastructure from earlier phases — don't rebuild
simulation, scoring, or LLM orchestration from scratch.

1. Wealth Digital Twin & Future Wealth Simulator: extend Phase 11's Monte
   Carlo engine to accept scenario parameters (job loss, inheritance, market
   crash %, home purchase, early retirement, inflation spike, currency
   depreciation, salary change) and show side-by-side projected net-worth
   paths.
2. AI CFO: a background job (reuses Phase 19's LLM orchestration) that
   periodically scans the user's full financial picture and proactively
   surfaces high-value insights ("your debt costs more than your investments
   earn," "increase your SIP by ₹5,000 to retire 3 years earlier") — deliver
   through the Phase 17 notification center, not just in-chat.
3. Opportunity Scanner: rules-based scan (extend Phase 15's tax-harvest logic
   pattern) for lower-fee fund alternatives, better-performing peers in the
   same category, rebalancing needs, and dividend opportunities.
4. Wealth Health Score (0-100): a weighted composite of diversification
   (Phase 11), liquidity/debt/risk (Phase 12), savings rate (Phase 10), tax
   efficiency (Phase 15), goal progress (Phase 13), and insurance adequacy
   (Phase 3 insurance data) — document the weighting methodology
   transparently, same as Phase 12's risk engine.
5. Financial Time Machine & Wealth Timeline: query historical
   NetWorthSnapshot and transaction data to reconstruct/visualize past
   states, and project forward using the simulator.
6. Wealth DNA classifier: an LLM- or rules-based classification into
   archetypes ("Growth Builder," "Income Generator," "Balanced Optimizer")
   based on actual behavior/risk/goal data, not a quiz.
7. One-Click Financial Health Audit: a long-form (30-50 page) PDF report
   combining every module's output with AI-written narrative sections —
   extends Phase 18's report engine.
8. AI Copilot: the always-on background version of the AI CFO, continuously
   monitoring and queuing insights for the user rather than waiting to be
   asked.

Acceptance criteria:
- Scenario simulator produces visibly different projected outcomes for a
  "market crash" vs "salary increase" scenario on the same test portfolio
- Wealth Health Score is independently reproducible from its documented
  formula given the same input data (deterministic, testable)
- Financial Health Audit PDF generates without errors and includes real data
  from every referenced module, not placeholder text
```

---

## Phase 21 — Family Office Mode & Estate Planning

**Context recap:** Single-user experience is complete; extend to multi-person households.

**Prompt:**
```
Build Family Office mode and estate planning. Read PROJECT_CONTEXT.md first.

1. Extend the Household model from Phase 1: link multiple Users (parents,
   spouse, children) with granular RBAC (already scaffolded in Phase 1 —
   extend it, don't rebuild it) controlling who can view/edit which
   individual's data.
2. Joint accounts and shared properties: assets that belong to the Household
   rather than a single User, correctly included in each linked member's net
   worth view without double-counting at the household level.
3. Family trust tracking and inheritance planning: a structured record of
   intended beneficiaries per major asset.
4. Estate planning: nominees per asset (extend the existing Asset model with
   a nominee field), will/trust document references (link into the Phase 16
   vault), beneficiary designations, and a simple asset-transfer checklist
   workflow.
5. Frontend: a household switcher/aggregate view showing combined family net
   worth alongside individual views, and an estate-planning checklist page
   showing which assets are missing a nominee designation.

Acceptance criteria:
- A joint asset appears correctly in the household aggregate and in each
  linked member's individual view without being double-counted
- A member with VIEWER role cannot edit another member's private assets
- Estate-planning checklist correctly flags assets missing a nominee
```

---

## Phase 22 — Security Hardening, Testing & QA

**Context recap:** Feature set is complete; before scaling up usage, harden everything.

**Prompt:**
```
Run a full security and QA pass across RicherWealth. Read PROJECT_CONTEXT.md
first.

1. OWASP Top 10 checklist review across the whole app — pay special
   attention to the auth flows (Phase 1), the document vault's encryption
   (Phase 16), and any endpoint that aggregates money across users
   (Household features from Phase 21).
2. Run OWASP ZAP (free) and Snyk (free tier) scans; fix or explicitly
   document (with justification) every finding.
3. Audit logging: every read/write to sensitive data (documents, bank sync,
   estate/nominee changes) writes an immutable audit-log entry with actor,
   action, timestamp.
4. Test coverage: fill gaps in the Jest unit tests written per-phase, add
   Playwright E2E tests covering the critical paths (signup → add asset →
   view dashboard → AI chat → export report), and load-test the price-sync
   and dashboard endpoints with k6 (free) to confirm they hold up under
   realistic concurrent load.
5. Verify every free-tier API integration degrades gracefully under rate-
   limit exhaustion (this should already be true per-phase — this is the
   integration-level regression pass).

Acceptance criteria:
- Zero unresolved high/critical findings from ZAP/Snyk scans
- E2E test suite passes covering the full critical user journey
- Load test shows acceptable p95 latency on the dashboard endpoint under
  realistic concurrent user load
- Audit log correctly records a test sequence of sensitive actions
```

---

## Phase 23 — Performance, Polish & UX Pass

**Context recap:** Security-hardened and tested; now make it feel like a premium product.

**Prompt:**
```
Run a performance and polish pass across RicherWealth. Read PROJECT_CONTEXT.md
first.

1. Lighthouse/Core Web Vitals audit on every major page; fix render-blocking
   issues, add code-splitting/lazy-loading for heavy modules (AG Grid,
   ECharts, the AI chat panel).
2. Skeleton loaders for every data-fetching view (replace any remaining
   spinner-only states).
3. Dark mode as a fully supported, properly-tested theme (not just an
   afterthought toggle) — verify chart color palettes work in both themes.
4. Mobile responsiveness pass across every page built in Phases 2-21.
5. Accessibility: WCAG AA audit via axe-core/axe DevTools (free) — fix
   contrast, keyboard navigation, and screen-reader labeling issues,
   especially on the dense data tables (AG Grid) and charts.
6. Micro-interaction polish pass with Framer Motion: consistent transition
   timing/easing across cards, page transitions, and the AI chat streaming
   response.

Acceptance criteria:
- Lighthouse performance score above 90 on the dashboard and analytics pages
- Zero critical/serious axe-core violations
- Every page usable end-to-end via keyboard alone
- Dark mode and light mode both pass the same accessibility and visual QA
  checklist
```

---

## Phase 24 — Deployment, Monitoring & Launch

**Context recap:** Product is complete, tested, and polished — ship it.

**Prompt:**
```
Deploy RicherWealth to production and set up monitoring. Read PROJECT_CONTEXT.md
first.

1. Deploy apps/web to Vercel (free hobby tier), apps/api and apps/quant to
   Render or Fly.io (free tiers), with environment-specific config for all
   API keys listed in Appendix B.
2. Set up Sentry (free tier, 5k errors/month) for error tracking on both
   frontend and backend, with source maps uploaded for readable stack traces.
3. Set up UptimeRobot (free tier) monitoring the API health-check endpoint
   and the frontend.
4. Production database backup strategy (even a basic scheduled pg_dump to
   free-tier object storage is fine to start).
5. Add a feedback-collection mechanism (in-app widget or simple form) to
   capture beta-user issues, and a lightweight admin view of Sentry errors +
   feedback for triage.
6. Write a runbook (RUNBOOK.md) covering: how to roll back a bad deploy, how
   to rotate a compromised API key, how to check which free-tier API is
   nearing its rate limit.

Acceptance criteria:
- Production URL is live and passes the same E2E test suite from Phase 22
  against the deployed environment
- A deliberately-triggered test error appears correctly in Sentry within a
  minute
- Uptime monitor correctly alerts when the API health-check is manually
  taken down
```

---

## Appendix A — Suggested Build Order Notes

- Phases 4-8 (asset-class integrations) can be reordered or parallelized
  across team members since they share a pattern but don't depend on each
  other — just make sure Phase 7's CurrencyService lands before you rely on
  multi-currency aggregation being correct elsewhere.
- Phase 19 (AI layer) is the one phase most worth pair-programming or
  reviewing carefully — grounding/hallucination bugs here are the hardest to
  catch later and the most damaging to user trust in a finance app.
- Don't start Phase 22 (security hardening) as a one-time end-of-project
  event in a real team setting — the checklist items are written here as a
  dedicated phase for a solo/small build, but OWASP review should really
  happen incrementally after Phases 1, 10, 16, and 21 (auth, banking data,
  documents, multi-user) at minimum.

## Appendix B — Environment Variables Checklist

```
# Auth
SUPABASE_URL=
SUPABASE_ANON_KEY=
NEXTAUTH_SECRET=

# Market data
ALPHA_VANTAGE_API_KEY=
FINNHUB_API_KEY=
TWELVE_DATA_API_KEY=

# Crypto
COINGECKO_API_KEY=          # optional, higher rate limit

# Forex / Metals
METALS_API_KEY=
GOLDAPI_KEY=

# Macro data
FRED_API_KEY=

# News
NEWSAPI_KEY=
GNEWS_API_KEY=

# Banking
PLAID_CLIENT_ID=
PLAID_SECRET=                # sandbox

# AI
ANTHROPIC_API_KEY=           # or OPENAI_API_KEY
OLLAMA_HOST=                 # local fallback, e.g. http://localhost:11434

# Storage
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Notifications
FIREBASE_SERVER_KEY=
RESEND_API_KEY=

# Monitoring
SENTRY_DSN=

# Maps
MAPBOX_ACCESS_TOKEN=         # optional, Leaflet+OSM needs no key
```

Get every free key up front (most are a 2-minute signup) so no phase is
blocked waiting on credentials mid-build.
