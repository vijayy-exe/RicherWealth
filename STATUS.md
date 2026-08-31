# RicherWealth — Status Review

_Last reviewed: 2026-08-31. Updated same day: Phase 1's two security/completeness gaps (MFA plaintext secret, missing WebAuthn passkey registration ceremony) were closed, and version control was initialized at the project root — see "Phase 1 gaps — now closed" and "Version control" below._

## Summary

The project is further along than `README.md` previously indicated. Phases 0–4 are substantially or fully implemented with real, working logic — not scaffolding. The backend in particular is high quality: Decimal-precision financial math, a genuine multi-provider stock price sync with rate-limiting, a real WebSocket layer, and clean CRUD patterns across modules. The frontend matches: every reviewed page does real data-fetching (React Query hooks) against the API, not static/placeholder content. The two security/completeness gaps originally found here have since been fixed (below), and the AG Grid frontend issue was confirmed resolved on all three grids.

## Phase-by-phase status

| Phase | Scope | Status | Notes |
|---|---|---|---|
| 0 | Architecture & Monorepo | ✅ Done | Turborepo + pnpm, all apps/packages scaffolded and wired. |
| 1 | Auth & Core Infrastructure | ✅ Done | Supabase auth, session mgmt, MFA/TOTP all real and working. MFA secrets are now encrypted at rest and the WebAuthn passkey registration ceremony is implemented end-to-end (frontend + backend). See "Phase 1 gaps — now closed" below. |
| 2 | Dashboard & Net Worth Engine | ✅ Done, with a known placeholder | `net-worth.service.ts` is real (Decimal.js, snapshotting, WS event emission). Dashboard page is fully wired to live data with real loading/empty/error states. **Known simplification (self-documented in code):** `emergencyFundHealth` uses a hardcoded `/50000` divisor pending real expense tracking (Phase 10). |
| 3 | Manual Asset & Liability Entry | ✅ Done | Both `assets` and `liabilities` pages/services are real: full CRUD, ownership checks, soft-delete, AG Grid tables with proper formatting, category tabs covering all 23 `AssetType` / 6 `LiabilityType` enum values, net-worth snapshot triggered on every mutation. |
| 4 | Stocks & Global Market Data | ✅ Done | Most-developed module (1,347 lines across 8 backend files). Real 3-provider fallback chain (Alpha Vantage → Finnhub → Twelve Data), a `@Cron` scheduler with a mutex and rate-limit-respecting inter-request delay, live WebSocket price ticks consumed by the frontend grid (flash-on-update cell renderer), watchlists, Graham-value/fair-value badges. Only module with a test file. |
| 5 | Mutual Funds, ETFs & Bonds | ⏳ Not started | Asset model supports these types generically (JSONB `details`) via the same generic asset form; no dedicated NAV/pricing logic yet. |
| 6–24 | Crypto through Deployment/Launch | ⏳ Not started | No module-specific code found for any of these phases beyond what the generic Asset/Liability model already covers incidentally. |

## Phase 1 gaps — now closed

**MFA secret encryption.** `mfaTotpSecret` was previously stored in plaintext. `apps/api/src/auth/crypto.util.ts` implements AES-256-GCM (Node's built-in `crypto`, authenticated encryption, random 12-byte IV per call, `iv:authTag:ciphertext` hex format). `enableTotp`/`verifyTotp` in `auth.service.ts` now encrypt/decrypt through it, keyed by the new `MFA_ENCRYPTION_KEY` env var (documented in `.env.example`, generated for local dev in `apps/api/.env`, gitignored). No Prisma migration was needed — the column was already a plain `String?`. Covered by new round-trip tests in `auth.service.spec.ts` (asserts the stored value is not the plaintext secret, and that a fresh valid token still verifies after decrypt).

**WebAuthn passkey registration ceremony.** Implemented with `@simplewebauthn/server` (API) and `@simplewebauthn/browser` (web). New: `apps/api/src/auth/passkey-challenge.store.ts` (in-memory, single-use, 5-minute-TTL challenge store keyed by userId — mirrors the existing `MemoryCacheService` pattern rather than adding a Redis/DB dependency, appropriate for this single-instance deployment). `AuthService.generatePasskeyRegistrationOptions`/`verifyPasskeyRegistration` and two new controller routes (`POST /auth/passkeys/register/options`, `POST /auth/passkeys/register/verify`). Frontend: `apps/web/src/hooks/usePasskeys.ts` runs the full ceremony (fetch options → `startRegistration` → verify), and the Settings page's "Register new passkey" button (previously inert) is now wired to it, with a live list of registered passkeys and a working remove action. RP ID/origin are configurable via `WEBAUTHN_RP_ID`/`WEBAUTHN_RP_ORIGIN` (default to `localhost` / `http://localhost:3000` for dev).

**Scope note — passkey *login* is still a placeholder, intentionally.** The login page's "Sign in with Passkey" button (`apps/web/src/app/(auth)/login/page.tsx`) is unchanged — it was already self-documented as a placeholder before this work (`provider: "google", // placeholder — swap for WebAuthn`). Wiring it up requires an authentication-ceremony ↔ session-issuance design this app doesn't have yet: Supabase is the authoritative session issuer here (`SupabaseAuthGuard` validates Supabase JWTs directly), and a custom WebAuthn login would need either the Supabase Admin API or a custom JWT path to mint a session without a password — an architectural decision, not a bug fix. Registering a passkey now works end-to-end and is stored correctly; using it to log in is future work.

## Resolved: the AG Grid question

`test-ag-error.js` at the repo root is a leftover Puppeteer debug script that loads `/stocks` and logs browser console errors/warnings — used to diagnose an AG Grid v33+ issue where importing the legacy CSS themes conflicts with the new Theming API and throws at runtime. The fix is in place on all three grids: `stocks/page.tsx`, `assets/page.tsx`, and `liabilities/page.tsx` all pass `theme="legacy"` to `<AgGridReact>` (confirmed by direct grep, not just the one page the debug script exercised). Safe to delete `test-ag-error.js`.

## Frontend depth check

All reviewed `apps/web/src/app/(app)/*/page.tsx` routes (dashboard, stocks, assets, liabilities — 2,094 lines total across just the page files) do real data-fetching via React Query hooks, have real loading/empty/error states, and are not placeholders. `auth.store.ts` (Zustand) and `lib/supabase/{client,server}.ts` are standard, correctly-implemented Supabase SSR patterns. `packages/shared-types` has real Zod schemas per domain (asset, auth, common, liability, transaction, user); `packages/ui` has a small real component set (Button, Card, Badge, Input) — not a stub despite an older comment in `README.md` calling it a stub.

## Version control — now initialized

The stray `apps/web/.git` (a separate, near-empty repo — one commit ever) was removed, and a single git repository was initialized at the project root. Initial commit `9c9030d` ("Initial commit: RicherWealth monorepo through Phase 4") covers all 154 files across Phases 0–4. All `.env` files are confirmed gitignored. A stray self-referential artifact directory (`Users/vijaysreeram/Downloads/RicherWealth/...`, pre-existing, not created by this work) is excluded via `.gitignore` but not yet deleted — flag to the user for confirmation before removing it from disk.

## Recommended next steps

1. Begin Phase 5 (Mutual Funds, ETFs & Bonds) per `RicherWealth_Phase_Build_Prompts.md`.
2. Revisit the Phase 2 emergency-fund placeholder once Phase 10 (expense tracking) lands.
3. When passkey *login* (not just registration) becomes a priority, decide on a session-issuance strategy compatible with Supabase-as-IdP (Admin API vs. custom JWT) — see the scope note above.
4. Confirm whether to delete the stray `Users/` artifact directory now that it's gitignored, and whether to delete `test-ag-error.js` now that the AG Grid fix is confirmed on all three grids.
