# RicherWealth — Status Review

_Last reviewed: 2026-08-31. This document reflects a code-level review of `apps/api`, `apps/web`, and `packages/*` against the phase definitions in `RicherWealth_Phase_Build_Prompts.md`. No source/logic code was modified to produce this review._

## Summary

The project is further along than `README.md` previously indicated. Phases 0–4 are substantially or fully implemented with real, working logic — not scaffolding. The backend in particular is high quality: Decimal-precision financial math, a genuine multi-provider stock price sync with rate-limiting, a real WebSocket layer, and clean CRUD patterns across modules. The frontend matches: every reviewed page does real data-fetching (React Query hooks) against the API, not static/placeholder content. Two concrete security/completeness gaps were found (below) and one previously-unclear frontend issue (AG Grid) was confirmed resolved.

## Phase-by-phase status

| Phase | Scope | Status | Notes |
|---|---|---|---|
| 0 | Architecture & Monorepo | ✅ Done | Turborepo + pnpm, all apps/packages scaffolded and wired. |
| 1 | Auth & Core Infrastructure | ✅ Done, with gaps | Supabase auth, session mgmt, MFA/TOTP all real and working. **Gap:** MFA secrets stored in plaintext (`apps/api/src/auth/auth.service.ts:201`, explicit `// TODO: encrypt with AES-256`). **Gap:** Passkey schema + list/rename/delete endpoints exist, but no actual WebAuthn registration ceremony (`generateRegistrationOptions`/`verifyRegistration`) exists anywhere in `apps/api/src` — passkey login cannot currently be completed end-to-end. |
| 2 | Dashboard & Net Worth Engine | ✅ Done, with a known placeholder | `net-worth.service.ts` is real (Decimal.js, snapshotting, WS event emission). Dashboard page is fully wired to live data with real loading/empty/error states. **Known simplification (self-documented in code):** `emergencyFundHealth` uses a hardcoded `/50000` divisor pending real expense tracking (Phase 10). |
| 3 | Manual Asset & Liability Entry | ✅ Done | Both `assets` and `liabilities` pages/services are real: full CRUD, ownership checks, soft-delete, AG Grid tables with proper formatting, category tabs covering all 23 `AssetType` / 6 `LiabilityType` enum values, net-worth snapshot triggered on every mutation. |
| 4 | Stocks & Global Market Data | ✅ Done | Most-developed module (1,347 lines across 8 backend files). Real 3-provider fallback chain (Alpha Vantage → Finnhub → Twelve Data), a `@Cron` scheduler with a mutex and rate-limit-respecting inter-request delay, live WebSocket price ticks consumed by the frontend grid (flash-on-update cell renderer), watchlists, Graham-value/fair-value badges. Only module with a test file. |
| 5 | Mutual Funds, ETFs & Bonds | ⏳ Not started | Asset model supports these types generically (JSONB `details`) via the same generic asset form; no dedicated NAV/pricing logic yet. |
| 6–24 | Crypto through Deployment/Launch | ⏳ Not started | No module-specific code found for any of these phases beyond what the generic Asset/Liability model already covers incidentally. |

## Resolved: the AG Grid question

`test-ag-error.js` at the repo root is a leftover Puppeteer debug script that loads `/stocks` and logs browser console errors/warnings — used to diagnose an AG Grid v33+ issue where importing the legacy CSS themes conflicts with the new Theming API and throws at runtime. The fix is already in place: `stocks/page.tsx` passes `theme="legacy"` to `<AgGridReact>` alongside the CSS imports. `assets/page.tsx` and `liabilities/page.tsx` should be checked for the same `theme="legacy"` prop if AG Grid errors resurface there, since the debug script only exercised `/stocks`. Safe to delete `test-ag-error.js` once you've confirmed the other two grids are clean.

## Frontend depth check

All reviewed `apps/web/src/app/(app)/*/page.tsx` routes (dashboard, stocks, assets, liabilities — 2,094 lines total across just the page files) do real data-fetching via React Query hooks, have real loading/empty/error states, and are not placeholders. `auth.store.ts` (Zustand) and `lib/supabase/{client,server}.ts` are standard, correctly-implemented Supabase SSR patterns. `packages/shared-types` has real Zod schemas per domain (asset, auth, common, liability, transaction, user); `packages/ui` has a small real component set (Button, Card, Badge, Input) — not a stub despite an older comment in `README.md` calling it a stub.

## Version control risk (restated, not remediated per review scope)

Confirmed earlier in this session, not re-run here: the **project root has no git repository at all** — `apps/api`, `apps/quant`, `packages/ui`, `packages/shared-types` have zero version-control history. `apps/web` has its *own* separate git repo, but with exactly **one commit ever** ("Initial commit from Create Next App"); everything built since — all of Phases 1–4's frontend work — is either modified-but-uncommitted or entirely untracked. In effect, none of the real implementation described in this document is protected against loss. This should be addressed before continuing further phases.

## Recommended next steps

1. Encrypt `mfaTotpSecret` at rest (AES-256) before any real users onboard — currently plaintext.
2. Decide whether Phase 1's passkey feature is in scope now or later; if now, implement the WebAuthn registration ceremony (`@simplewebauthn/server` or similar) — the schema and management UI already assume it exists.
3. Initialize git version control for the project root if not already done, and commit current state.
4. Begin Phase 5 (Mutual Funds, ETFs & Bonds) per `RicherWealth_Phase_Build_Prompts.md`.
5. Revisit the Phase 2 emergency-fund placeholder once Phase 10 (expense tracking) lands.
