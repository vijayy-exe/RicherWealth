# RicherWealth — AI-Powered Wealth Operating System

> **"Most finance apps answer 'what do I own?' — RicherWealth answers 'what should I do next to maximize my wealth?'"**

[![CI](https://github.com/your-org/richer-wealth/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/richer-wealth/actions/workflows/ci.yml)

---

## Overview

RicherWealth is a full-stack, AI-powered personal and family wealth management platform. It tracks every asset class (stocks, crypto, real estate, mutual funds, gold, retirement accounts, insurance, etc.), runs quantitative portfolio analytics, and surfaces actionable AI-generated insights — not just a dashboard of numbers.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion |
| Styling | Glassmorphism dark-mode design system (custom tokens) |
| Charts | Recharts + Apache ECharts |
| State | TanStack Query + Zustand |
| Forms | React Hook Form + Zod |
| Backend | NestJS 11 · TypeScript strict |
| Database | PostgreSQL 16 + pgvector · Prisma ORM |
| Cache/Queues | Redis 7 · BullMQ |
| API | GraphQL (dashboard) + REST (webhooks) |
| Realtime | WebSockets (live prices) |
| Quant | Python FastAPI · numpy · pandas · scipy |
| AI | Claude API / OpenAI + Ollama (local fallback) + pgvector RAG |
| Auth | Supabase Auth / Auth.js · WebAuthn · MFA (TOTP) |
| Storage | Supabase Storage / Cloudflare R2 |
| Monorepo | Turborepo · pnpm workspaces |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20.0.0 |
| pnpm | ≥ 9.0.0 (`npm install -g pnpm@9`) |
| Docker Desktop | Latest |
| Python (optional) | ≥ 3.12 (for `apps/quant`) |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/richer-wealth.git
cd richer-wealth

# 2. Copy environment variables
cp .env.example .env
# Edit .env and fill in any required values (see below)

# 3. Start Postgres + Redis
docker-compose up -d

# 4. Install all dependencies
pnpm install

# 5. Run Prisma migration
pnpm --filter @richer/api prisma migrate dev --name init

# 6. Start all apps in dev mode
pnpm dev
```

After this:
- **Web** → http://localhost:3000
- **API** → http://localhost:4000/api
- **API Health** → http://localhost:4000/api/health
- **Quant** → http://localhost:8000 (manual, see below)

### Starting the Quant microservice (optional for Phase 0)

The Python quant service runs separately from pnpm:

```bash
cd apps/quant
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

---

## Monorepo Structure

```
richer-wealth/
├── apps/
│   ├── web/              # Next.js 16 frontend (port 3000)
│   ├── api/              # NestJS backend (port 4000)
│   └── quant/            # Python FastAPI analytics (port 8000)
├── packages/
│   ├── shared-types/     # Zod schemas + TS types (shared between web & api)
│   └── ui/               # shadcn/ui component library (stub; filled in Phase 2+)
├── docker/
│   └── postgres/init.sql # pgvector + pg_trgm extension init
├── .github/workflows/    # CI pipeline
├── docker-compose.yml    # Local Postgres 16 + Redis 7
├── turbo.json            # Turborepo pipeline
├── pnpm-workspace.yaml   # pnpm workspace definition
├── tsconfig.base.json    # Shared TypeScript strict base config
├── .eslintrc.js          # Root ESLint config
├── .prettierrc           # Prettier config
└── PROJECT_CONTEXT.md    # Master project context (read before every session)
```

---

## Development Commands

```bash
# Run all apps in dev mode
pnpm dev

# Run only the web app
pnpm --filter @richer/web dev

# Run only the API
pnpm --filter @richer/api dev

# Lint all packages
pnpm lint

# Typecheck all packages
pnpm typecheck

# Run all tests
pnpm test

# Prisma commands (from repo root)
pnpm --filter @richer/api prisma studio
pnpm --filter @richer/api prisma migrate dev
pnpm --filter @richer/api prisma generate

# Docker services
docker-compose up -d        # Start Postgres + Redis
docker-compose down         # Stop
docker-compose up --profile tools -d  # Also start Redis Commander (port 8081)
```

---

## Environment Variables

Copy `.env.example` to `.env`. Required for Phase 0:

```env
DATABASE_URL="postgresql://richerwealth:richerwealth@localhost:5432/richerwealth?schema=public"
REDIS_URL="redis://localhost:6379"
```

All other variables (API keys for market data, AI, auth) are optional until the phases that need them.

---

## Design System

The glassmorphism dark fintech design system lives in:
- **Tokens**: [`apps/web/src/styles/design-tokens.css`](apps/web/src/styles/design-tokens.css)
- **Global CSS**: [`apps/web/src/app/globals.css`](apps/web/src/app/globals.css)

Key design decisions:
- **Background**: `#090E1A` — deep navy
- **Glass panels**: `rgba(255,255,255,0.04)` + `backdrop-filter: blur(12px)`
- **Gain**: `#00D97E` (emerald green)
- **Loss**: `#FF4D6D` (crimson red)
- **Accent**: `#3D83FF` (electric blue)
- **Font**: Inter (Google Fonts)

---

## Phases

See [`RicherWealth_Phase_Build_Prompts.md`](RicherWealth_Phase_Build_Prompts.md) for full phase-by-phase prompts.

| Phase | Name | Status |
|---|---|---|
| **0** | Architecture & Monorepo | ✅ Done |
| 1 | Auth & Core Infrastructure | ✅ Done |
| 2 | Dashboard & Net Worth Engine | ✅ Done (emergency-fund calc uses a Phase 10 placeholder divisor) |
| 3 | Manual Asset & Liability Entry | ✅ Done |
| 4 | Stocks & Live Market Data | ✅ Done |
| 5 | Mutual Funds, ETFs & Bonds | ⏳ Next |
| 6 | Crypto Integration | — |
| 7 | Commodities, Forex & Precious Metals | — |
| 8 | Real Estate & Alternative Assets | — |
| 9 | Liabilities & Loan Intelligence | — |
| 10 | Income, Expenses & Banking Sync | — |
| 11 | Portfolio Analytics Engine | — |
| 12 | Risk Engine | — |
| 13 | Goals & Calculators | — |
| 14 | Market Intelligence & News | — |
| 15 | Tax Center | — |
| 16 | Encrypted Document Vault | — |
| 17 | Alert & Notification Center | — |
| 18 | Reports Engine | — |
| 19 | AI Analyst & AI Chat | — |
| 20 | Advanced AI Features | — |

---

## Contributing

1. Read `PROJECT_CONTEXT.md` before starting any session
2. Work one phase at a time (don't skip ahead)
3. Commit after each phase: `git commit -m "Phase N: <name>"`
4. Every new asset type needs a Zod schema in `packages/shared-types` before any code
5. TypeScript strict mode — no `any`, no `!` (non-null assertion)
6. All monetary values must store an explicit `currencyCode` — never convert at write-time

---

## License

Private — All rights reserved.
