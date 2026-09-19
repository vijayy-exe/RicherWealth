import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

/**
 * The real signup FORM (`apps/web/src/app/(auth)/signup/page.tsx`) always
 * ends at a "check your inbox" screen — Supabase email confirmation is not
 * something a headless test can click through without inbox access. So
 * this suite does both: it drives the real signup form to prove that path
 * works up to the confirmation screen (critical-path.spec.ts's first
 * step), and separately uses the Supabase Admin API to create an
 * already-confirmed user (same technique STATUS.md's Phase 19 live
 * verification used) to actually log in and exercise the rest of the
 * critical path. Every test-created user is deleted afterward.
 */
export function adminClient() {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set (see apps/e2e/playwright.config.ts's dotenv load).");
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function createConfirmedTestUser(email: string, password: string, name: string) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) throw new Error(`Failed to create E2E test user: ${error?.message}`);

  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  await fetch(`${apiUrl}/api/auth/sync-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ supabaseId: data.user.id, email, name }),
  });

  return data.user;
}

/**
 * Deletes both the Supabase auth user AND the app's own Postgres `User`
 * row (a separate table this API syncs into via /auth/sync-user — the
 * Supabase Admin API has no idea it exists, so deleting only the auth
 * user leaves an orphaned row plus every Asset/etc. it cascades). Matches
 * this repo's own established convention (see STATUS.md's Phase 16/19
 * live-verification sections) of deleting every test-created row, not
 * just the auth account.
 */
export async function deleteTestUser(userId: string, email: string) {
  const admin = adminClient();
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) return;
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    await pg.query('DELETE FROM "users" WHERE "email" = $1', [email]); // cascades to assets/etc.
  } finally {
    await pg.end();
  }
}
