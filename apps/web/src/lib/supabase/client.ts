import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (singleton).
 * Used in Client Components and event handlers.
 *
 * This client handles:
 * - Auth state management (session, token refresh)
 * - Realtime subscriptions
 * - Storage operations
 */
export function createClient() {
  return createBrowserClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ?? "",
  );
}
