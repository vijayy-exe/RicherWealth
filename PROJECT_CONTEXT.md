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
UI QUALITY BAR (applies to every phase from here forward):
- This is a premium fintech product, not an admin CRUD panel. Every screen
  should look like it belongs next to Mercury, Copilot Money, or Wealthfront —
  not like a generated form.
- Real design intent: deliberate spacing/rhythm (consistent 4/8px scale),
  a clear visual hierarchy (numbers that matter should be the largest/boldest
  element on the card), and restraint — no default browser form styling,
  no unstyled tables, no raw JSON dumps anywhere in the UI.
- Every data-entry form gets: inline validation with clear error states,
  sensible input types (currency inputs formatted as currency, date pickers
  not raw text fields), loading and empty states designed with the same care
  as the populated state — never a blank screen or a lone spinner.
- Tables (AG Grid) get proper column formatting (currency, %, date), row
  hover states, and empty/loading states styled to match the rest of the app.
- Motion (Framer Motion) should feel purposeful, not decorative — subtle
  entrance transitions, smooth number count-ups, no gratuitous bouncing.
- Every new page/component must work in both dark and light mode from the
  moment it's built, not patched in later.
CURRENT PHASE: Phase 10 complete (Income Tracking, Expense Tracking & Bank Sync) — Phase 11 is next. Income is a dedicated model (structured amount+frequency, monthlyized via packages/shared-types/src/calc/recurring-amount.ts — same shared-package-for-both-apps pattern as Phase 9's amortization engine, so the income form's live monthly preview matches the backend's dashboard figure exactly); expenses ride the existing generic Transaction table (type="expense"), which Phase 0 had already scaffolded for exactly this. Auto-categorization is a merchant-keyword rules engine (apps/api/src/transactions/categorization/category-rules.ts): a static seed map checked first for a match, then a per-user CategoryRule table that's written to automatically whenever a transaction is (re)categorized — manually or via correcting a low-confidence match — so the ruleset improves per-user over time without any ML. Bank sync has two independent providers behind a shared `StatementImportProvider` interface (apps/api/src/bank-sync/providers/): Plaid Sandbox for US/EU (transactionsSync with cursor-based incremental pulls, access tokens encrypted at rest with the same AES-256-GCM scheme as Phase 1's MFA secret), and CSV/PDF statement upload for India's free-tier path — both normalize to the same `NormalizedBankTransaction` shape and flow through one `TransactionsService.bulkIngest` pipeline (categorize + dedupe), so a future paid Account Aggregator integration is a drop-in third provider, not a rewrite. The Phase 2 emergency-fund placeholder (hardcoded /50000 divisor) is now replaced with a real trailing-3-month expense average, computed in DashboardResolver and falling back to the old placeholder only when a user has no expense history yet. Phase 9 (Liabilities & Loan Intelligence) and Phases 5-8 (Mutual Funds/ETFs/Bonds, Cryptocurrency, Commodities/Forex/Precious Metals, Real Estate & Alternative Assets) are also complete. Phase 1's MFA secret encryption and WebAuthn passkey registration ceremony gaps are now closed (see STATUS.md).
