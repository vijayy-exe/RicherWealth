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
CURRENT PHASE: Phase 4 complete (Stocks & Global Market Data Integration) — Phase 5 (Mutual Funds, ETFs & Bonds) is next. See STATUS.md for the full phase-by-phase review, including outstanding gaps carried over from Phase 1 (MFA secret encryption, WebAuthn passkey ceremony) and Phase 2 (emergency-fund placeholder calc).
