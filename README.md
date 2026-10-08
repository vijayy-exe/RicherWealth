# RicherWealth — AI-Powered Wealth Operating System

> **"Most finance apps answer 'what do I own?' — RicherWealth answers 'what should I do next to maximize my wealth?'"**

[![CI](https://github.com/vijayy-exe/RicherWealth/actions/workflows/ci.yml/badge.svg)](https://github.com/vijayy-exe/RicherWealth/actions/workflows/ci.yml)

---

## Overview

RicherWealth is a full-stack, production-grade personal and family wealth management platform. It tracks every asset class — stocks, crypto, real estate, mutual funds, gold, retirement accounts, insurance, and more — runs quantitative portfolio analytics, and surfaces actionable AI-generated insights through natural-language chat and scheduled reports. Not just a dashboard of numbers.

**22 phases. Fully built. End-to-end verified.**

---

## Features

### 💰 Complete Asset Universe
- **Stocks & Live Market Data** — 3-provider fallback (Alpha Vantage → Finnhub → Twelve Data), live WebSocket price ticks, watchlists, Graham/fair-value badges
- **Mutual Funds, ETFs & Bonds** — NAV sync via MFAPI.in, XIRR/CAGR calculation, SIP tracking, YTM
- **Cryptocurrency** — CoinGecko primary, Binance fallback, real-time price alerts
- **Precious Metals & Commodities** — Live gold/silver spot (gold-api.com), Yahoo Finance futures (oil, wheat, coffee, copper, corn, natural gas)
- **Real Estate & Alternative Assets** — Manual valuations, revaluation history, rental income tracking
- **Forex Holdings** — Live exchange rates via Frankfurter.app + open.er-api.com, Redis-cached
- **Manual Assets & Liabilities** — 23 asset types, 6 liability types, full CRUD, soft-delete

### 📊 Analytics & Intelligence
- **Net Worth Engine** — Decimal.js precision, multi-currency correct aggregation, WS event emission on every mutation, snapshotting
- **Portfolio Analytics** — Sector allocation, concentration risk, currency-exposure breakdown
- **Risk Engine** — Risk scoring, volatility, drawdown metrics
- **Goals & Monte Carlo Simulation** — 13 financial calculators + Monte Carlo goal-probability via quant microservice

### 🤖 AI Layer
- **AI Chat** — RAG over pgvector (nomic-embed-text embeddings), Claude primary / Ollama local fallback, answers grounded in your real portfolio data — declines rather than hallucinating
- **Scheduled AI Reports** — Daily/weekly/monthly/yearly narrative reports (BullMQ cron), real numbers from live services, natural-language phrasing by LLM
- **Suggestion Engine** — Rules-first SELL/REBALANCE/TAX_HARVEST/INCREASE_SIP cards with exact triggering datapoints — traceable, not black-box

### 📄 Reports & Tax
- **Reports Engine** — 4 institutional-grade PDF reports (net worth statement, portfolio analytics, tax report, financial snapshot) via pdfkit; Excel/CSV export on every AG Grid table
- **Tax Center** — FIFO capital gains, short/long-term classification, dividend tracking, rules-based tax-loss harvesting, versioned US/India tax config
- **ITR Document Upload & Analysis** — AI-assisted ITR parsing

### 🏦 Family & Estate
- **Family Office Mode** — Multi-member households, joint asset ownership, household-aggregate views
- **Estate Planning** — Nominee tracking (name, relationship, contact), `EstateBeneficiary` records, asset-transfer checklists (6-step, auto-seeded per asset)
- **Zero-Knowledge Document Vault** — Client-side AES-256-GCM (Web Crypto + PBKDF2), verified empirically at the network/DB/storage layer — ciphertext only, never plaintext

### 🔔 Operational
- **Alerts & Notification Center** — BullMQ rules engine, 7 alert types (price crash, SIP due, property revaluation, loan payment, etc.), in-app/push/email channels, idempotent evaluation
- **Market Intelligence & News** — Real-time market feeds, news aggregation with sentiment, independently re-verified
- **Immutable Audit Logging** — Append-only event log for all financial mutations
- **Playwright E2E + k6 Load Tests** — Critical-path E2E coverage and load test suite for price-sync/dashboard endpoints

### 🔐 Security
- **Auth** — Supabase Auth, MFA/TOTP (AES-256-GCM encrypted secrets at rest), WebAuthn passkey registration
- **Income, Expenses & Banking Sync** — Transaction tracking, income categorisation, bank-sync integration

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion |
| Styling | Glassmorphism dark-mode design system (custom CSS tokens) |
| Charts | Recharts + Apache ECharts |
| State | TanStack Query + Zustand |
| Forms | React Hook Form + Zod |
| Tables | AG Grid |
| Backend | NestJS 11 · TypeScript strict |
| Database | PostgreSQL 16 + pgvector · Prisma ORM |
| Cache / Queues | Redis 7 · BullMQ |
| API | GraphQL (dashboard) + REST (webhooks & data endpoints) |
| Realtime | WebSockets (live prices) |
| Quant | Python FastAPI · numpy · pandas · scipy |
| AI | Anthropic Claude (primary) · Ollama local fallback · pgvector RAG |
| Auth | Supabase Auth · WebAuthn · MFA (TOTP) |
| Storage | Supabase Storage |
| Monorepo | Turborepo · pnpm workspaces |
| Testing | Jest · Playwright E2E · k6 load tests |

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20.0.0 |
| pnpm | ≥ 9.0.0 (`npm install -g pnpm@9`) |
| Docker Desktop | Latest |
| Python (optional) | ≥ 3.12 (for `apps/quant` Monte Carlo) |

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/vijayy-exe/RicherWealth.git
cd RicherWealth

# 2. Copy environment variables
cp .env.example .env
# Edit .env — see Environment Variables section below

# 3. Start Postgres + Redis
docker-compose up -d

# 4. Install all dependencies
pnpm install

# 5. Run Prisma migrations
pnpm --filter @richer/api prisma migrate dev

# 6. Start all apps in dev mode
pnpm dev
```

After this:
- **Web** → http://localhost:3000
- **API** → http://localhost:4000/api
- **API Health** → http://localhost:4000/api/health
- **Quant** → http://localhost:8000 *(optional — see below)*

### Starting the Quant microservice (optional)

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
RicherWealth/
├── apps/
│   ├── web/              # Next.js 16 frontend (port 3000)
│   ├── api/              # NestJS 11 backend (port 4000)
│   ├── quant/            # Python FastAPI analytics / Monte Carlo (port 8000)
│   └── e2e/              # Playwright end-to-end test suite
├── packages/
│   ├── shared-types/     # Zod schemas + TS types (shared between web & api)
│   └── ui/               # Shared component library
├── load-test/            # k6 load test scripts
├── docker/
│   └── postgres/init.sql # pgvector + pg_trgm extension init
├── .github/workflows/    # CI pipeline
├── docker-compose.yml    # Local Postgres 16 + Redis 7
├── turbo.json            # Turborepo pipeline config
├── pnpm-workspace.yaml   # pnpm workspace definition
├── tsconfig.base.json    # Shared TypeScript strict base config
├── STATUS.md             # Detailed phase-by-phase build log
├── PROJECT_CONTEXT.md    # Master project context
└── RISK_METHODOLOGY.md   # Risk scoring methodology
```

---

## Frontend Pages

| Route | Description |
|---|---|
| `/dashboard` | Net worth summary, KPIs, live WS price feed |
| `/assets` | All 23 asset types — AG Grid, full CRUD |
| `/liabilities` | Loans & liabilities — amortization schedules |
| `/stocks` | Live stock prices, watchlists, fair-value badges |
| `/mutual-funds` | MF/ETF/Bond holdings, NAV sync, XIRR |
| `/crypto` | Crypto portfolio, price alerts |
| `/precious-metals` | Gold, silver, jewellery — live spot pricing |
| `/commodities` | Oil, wheat, coffee, copper — Yahoo Finance |
| `/real-estate` | Property portfolio, revaluation history |
| `/income` | Income & expense tracking, bank-sync |
| `/transactions` | Full transaction history, CSV export |
| `/analytics` | Portfolio analytics, sector/currency breakdown |
| `/risk` | Risk scores, volatility, drawdown |
| `/goals` | Financial goals, Monte Carlo simulation |
| `/calculators` | 13 financial calculators (SIP, EMI, etc.) |
| `/markets` | Market intelligence & news with sentiment |
| `/tax` | Capital gains, tax-loss harvesting, reports |
| `/vault` | Zero-knowledge encrypted document vault |
| `/ai-chat` | RAG-grounded AI portfolio analyst |
| `/reports` | Institutional PDF reports + AI narrative |
| `/household` | Family Office — multi-member households |
| `/estate-planning` | Nominees, beneficiaries, transfer checklists |
| `/wealth` | Wealth Health Score, Time Machine, DNA, Digital Twin |
| `/alerts` | Alert configuration & notification centre |
| `/settings` | Profile, MFA, passkeys, currency preferences |

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
docker-compose up -d                          # Start Postgres + Redis
docker-compose down                           # Stop
docker-compose up --profile tools -d          # Also start Redis Commander (port 8081)
```

---

## Environment Variables

Copy `.env.example` to `.env`. Required to run locally:

```env
# Database & Cache
DATABASE_URL="postgresql://richerwealth:richerwealth@localhost:5432/richerwealth?schema=public"
REDIS_URL="redis://localhost:6379"

# Supabase (Auth + Storage)
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_ROLE_KEY="..."

# Security
JWT_SECRET="..."
MFA_ENCRYPTION_KEY="..."       # 32-byte hex — for AES-256-GCM MFA secret encryption
```

Optional (enable progressively):

```env
# AI
ANTHROPIC_API_KEY="..."        # Claude — falls back to Ollama without this
OPENAI_API_KEY="..."           # Alternative LLM

# Market Data
ALPHA_VANTAGE_API_KEY="..."
FINNHUB_API_KEY="..."
TWELVE_DATA_API_KEY="..."

# Notifications
FCM_SERVER_KEY="..."           # Firebase — push notifications
SMTP_HOST / SMTP_USER / ...    # Email alerts
```

See `.env.example` for the full list with descriptions.

---

## Design System

The glassmorphism dark fintech design system lives in:
- **Tokens**: [`apps/web/src/styles/design-tokens.css`](apps/web/src/styles/design-tokens.css)
- **Global CSS**: [`apps/web/src/app/globals.css`](apps/web/src/app/globals.css)

Key decisions:
| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#090E1A` | Deep navy background |
| Glass panels | `rgba(255,255,255,0.04)` + `backdrop-filter: blur(12px)` | All cards |
| Gain | `#00D97E` | Positive P&L, growth |
| Loss | `#FF4D6D` | Negative P&L, risk |
| Accent | `#3D83FF` | CTAs, links, highlights |
| Font | Inter (Google Fonts) | All text |

---

## Phase Build Log

All 22 phases are complete. Full notes, verification evidence, and known limitations for each phase are in [`STATUS.md`](STATUS.md).

| Phase | Name | Status |
|---|---|---|
| 0 | Architecture & Monorepo | ✅ Done |
| 1 | Auth & Core Infrastructure | ✅ Done |
| 2 | Dashboard & Net Worth Engine | ✅ Done |
| 3 | Manual Asset & Liability Entry | ✅ Done |
| 4 | Stocks & Live Market Data | ✅ Done |
| 5 | Mutual Funds, ETFs & Bonds | ✅ Done |
| 6 | Cryptocurrency | ✅ Done |
| 7 | Commodities, Forex & Precious Metals | ✅ Done |
| 8 | Real Estate & Alternative Assets | ✅ Done |
| 9 | Liabilities & Loan Intelligence | ✅ Done |
| 10 | Income, Expenses & Banking Sync | ✅ Done |
| 11 | Portfolio Analytics Engine | ✅ Done |
| 12 | Risk Engine | ✅ Done |
| 13 | Goals & Calculators | ✅ Done |
| 14 | Market Intelligence & News | ✅ Done |
| 15 | Tax Center | ✅ Done |
| 16 | Zero-Knowledge Document Vault | ✅ Done |
| 17 | Alerts & Notification Center | ✅ Done |
| 18 | Reports Engine | ✅ Done |
| 19 | AI Analyst & AI Chat | ✅ Done |
| 20 | Wealth Health Score, Time Machine & Digital Twin | ✅ Done |
| 21 | Family Office Mode & Estate Planning | ✅ Done |
| 22 | Full Security & QA Pass | ✅ Done |

---

## License

Private — All rights reserved.
