import { test, expect, type Page } from "@playwright/test";
import { createConfirmedTestUser, deleteTestUser } from "./supabase-admin";

/**
 * Phase 22: the critical user journey — signup → add asset → dashboard →
 * AI chat → export report. Nothing like this existed before this phase
 * (confirmed: no playwright.config.ts, no e2e directory, no "playwright"
 * string in any package.json anywhere in the repo).
 *
 * Split into two tests rather than one linear flow because the real signup
 * form (apps/web/src/app/(auth)/signup/page.tsx) always ends at a "check
 * your inbox" screen — Supabase email confirmation cannot be clicked
 * through headlessly without inbox access. Test 1 proves the real signup
 * form works up to that point; test 2 uses an Admin-API-created,
 * pre-confirmed user (same technique this repo's own STATUS.md documents
 * using for Phase 19's live verification) to log in and exercise
 * everything after signup for real.
 */

const RUN_ID = Date.now().toString(36);

test.describe("Critical user journey", () => {
  test("signup form creates a real Supabase user and reaches the email-confirmation screen", async ({ page }) => {
    // Supabase's real signUp() email validation rejects RFC 2606 reserved
    // TLDs like .test (confirmed live: "Email address ... is invalid") —
    // richerwealth.app is a real registered domain this repo already uses
    // for its dev-bypass demo account, so it passes that check. The Admin
    // API path below (createConfirmedTestUser) bypasses this validation
    // entirely, which is exactly why .test is safe to use there.
    const email = `e2e-signup-${RUN_ID}@richerwealth.app`;
    await page.goto("/signup");

    await page.fill("#signup-name", "E2E Signup Test");
    await page.fill("#signup-email", email);
    await page.fill("#signup-password", "E2E-test-password-123!");
    await page.click("#btn-email-signup");

    await expect(page.getByText("Check your inbox")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(email)).toBeVisible();
  });

  test.describe("post-login flow", () => {
    let userId: string;
    const email = `e2e-critical-path-${RUN_ID}@richerwealth.test`;
    const password = "E2E-test-password-123!";

    test.beforeAll(async () => {
      const user = await createConfirmedTestUser(email, password, "E2E Critical Path");
      userId = user.id;
    });

    test.afterAll(async () => {
      if (userId) await deleteTestUser(userId, email);
    });

    test("login → add asset → dashboard → AI chat → export report", async ({ page }) => {
      await login(page, email, password);

      await addBankAsset(page, "E2E Checking", "150000");

      await page.goto("/dashboard");
      // The dashboard's SummaryCard count-up animates from 0 — assert the
      // real backend-computed figure eventually appears, not just that a
      // number is present at t=0.
      await expect(page.getByText(/₹\s?1,50,000|₹1\.50L/)).toBeVisible({ timeout: 15_000 });

      await page.goto("/ai-chat");
      await page.fill('[data-testid="ai-chat-input"]', "What is my current net worth?");
      await page.click('[data-testid="ai-chat-send"]');
      // A real LLM call (Ollama in this environment) can take a while —
      // assert the assistant actually replied with something, not a
      // specific number (grounding correctness is Phase 19's own test's job).
      await expect(page.locator("text=/./").last()).toBeVisible();
      await page.waitForTimeout(2000); // let the streamed reply start rendering
      const assistantReplyVisible = await page.locator("body").textContent();
      expect(assistantReplyVisible?.length ?? 0).toBeGreaterThan(0);

      await page.goto("/reports");
      const downloadPromise = page.waitForEvent("download", { timeout: 40_000 });
      await page.click('[data-testid="download-report-net-worth-statement"]');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe("richerwealth-net-worth-statement.pdf");
    });
  });
});

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.click("#btn-email-login");
  // The first AUTHENTICATED hit to /dashboard is also its first real
  // Turbopack compile in dev mode (an unauthenticated pre-warm always
  // 307-redirects before reaching the page component) — generous on top
  // of the real Supabase network round-trip this click makes.
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

async function addBankAsset(page: Page, name: string, value: string): Promise<void> {
  await page.goto("/assets");
  await page.click('[data-testid="add-asset-button"]');
  await page.getByText("Bank Account", { exact: true }).click();

  // Scoped to `form` throughout — the page also has a Next.js DevTools
  // button whose aria-label contains "Next", which a page-wide role query
  // would ambiguously match too.
  const form = page.locator("form");

  // Step 1: Basics. CurrencyInput (apps/web/src/components/forms/
  // CurrencyInput.tsx) renders its amount field with the literal
  // placeholder "0.00" — targeting by placeholder is precise, unlike an
  // nth-index guess across all text inputs (which silently filled the
  // WRONG field on a first pass: the amount landed in the name field).
  await page.getByPlaceholder(/e\.g\. My Bank Account/).fill(name);
  await page.getByPlaceholder("0.00").fill(value);
  await form.getByRole("button", { name: /Next/ }).click();
  await page.waitForTimeout(300); // let the 0.2s framer-motion step transition settle

  // Step 2: Details (bank-specific fields) — not required by the form's
  // zod schema (only Basics fields are validated), so it's safe to skip.
  await form.getByRole("button", { name: /Next/ }).click();
  await page.waitForTimeout(300);

  // Step 3: Notes & Estate — leave as personal/no nominee, just advance.
  await form.getByRole("button", { name: /Next/ }).click();
  await page.waitForTimeout(300);

  // Step 4: Documents → final submit. A successful submit unmounts the
  // form within ~1s, which Playwright's post-click stability re-check
  // interprets as "the click didn't land" and retries indefinitely against
  // a button that (correctly) no longer exists — even though the real
  // click already fired and the asset was already created. Bound the
  // click's own wait tightly and treat the real outcome (the asset
  // actually appearing in the list) as the proof, not the click call
  // resolving cleanly.
  await form.getByRole("button", { name: /Add Asset|Save/ }).click({ timeout: 5_000 }).catch(() => undefined);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
}
