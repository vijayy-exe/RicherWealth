import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase OAuth callback handler.
 * Exchanges the authorization code for a session and redirects the user.
 *
 * Supabase redirects to: /auth/callback?code=<code>&next=<path>
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Sync user to local DB
      const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      await fetch(`${apiUrl}/api/auth/sync-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseId: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata["name"] ?? null,
          avatarUrl: data.user.user_metadata["avatar_url"] ?? null,
        }),
      }).catch(() => { /* Non-fatal — user row will be created on next request */ });

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env["NODE_ENV"] === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Auth failed
  return NextResponse.redirect(`${origin}/login?error=auth-failed`);
}
