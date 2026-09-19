import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load the monorepo root .env — the same Supabase project apps/web/apps/api
// already point at, so this suite exercises the real auth backend, not a
// stub.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Phase 22: Playwright E2E — nothing like this existed anywhere in the
 * repo before this phase (confirmed by grep). Runs against the already-
 * running dev servers (apps/web on :3000, apps/api on :4000) rather than
 * spawning its own — this suite assumes `pnpm dev` is already up, same
 * assumption this whole session's manual browser verification has used.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  // Real LLM calls (Ollama in this environment) can cold-load in ~20s per
  // STATUS.md's own measured Phase 19 notes, on top of a 4-step form +
  // several real page navigations — 60s was too tight end-to-end.
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
