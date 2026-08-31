"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) { setError(error.message); return; }

      // Sync user to local DB
      if (data.user) {
        const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
        await fetch(`${API_URL}/api/auth/sync-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supabaseId: data.user.id,
            email: data.user.email,
            name,
          }),
        });
      }

      setDone(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignup() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  if (done) {
    return (
      <div className="glass-card" style={{ padding: "2rem", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📧</div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>
          Check your inbox
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
          We sent a verification link to <strong style={{ color: "var(--color-text-primary)" }}>{email}</strong>.
          Click it to activate your account.
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          Already verified?{" "}
          <Link href="/login" style={{ color: "var(--color-accent)" }}>Sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>
        Create your account
      </h1>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.75rem" }}>
        Start your journey to financial clarity
      </p>

      <button
        id="btn-google-signup"
        type="button"
        onClick={() => void handleGoogleSignup()}
        style={socialBtnStyle}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <Divider />

      <form onSubmit={(e) => void handleSignup(e)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && (
          <div role="alert" style={errorStyle}>{error}</div>
        )}

        <div>
          <label htmlFor="signup-name" style={labelStyle}>Full name</label>
          <input id="signup-name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Johnson" style={inputStyle} />
        </div>

        <div>
          <label htmlFor="signup-email" style={labelStyle}>Email</label>
          <input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
        </div>

        <div>
          <label htmlFor="signup-password" style={labelStyle}>Password</label>
          <input id="signup-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" style={inputStyle} />
        </div>

        <button id="btn-email-signup" type="submit" disabled={isLoading} style={primaryBtnStyle}>
          {isLoading ? "Creating account…" : "Create account"}
        </button>

        <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textAlign: "center" }}>
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>

      <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--color-accent)", fontWeight: 600 }}>Sign in</Link>
      </p>
    </div>
  );
}

const socialBtnStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: "0.625rem", width: "100%", padding: "0.625rem 1rem", background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)", color: "var(--color-text-primary)", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", marginBottom: "1.5rem" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: 6, fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.625rem 0.875rem", background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)", color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none" };
const primaryBtnStyle: React.CSSProperties = { width: "100%", padding: "0.75rem", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: "0.75rem 1rem", background: "var(--color-loss-muted)", border: "1px solid rgba(255,77,109,0.2)", borderRadius: "var(--radius-md)", color: "var(--color-loss)", fontSize: "0.875rem" };
function Divider() { return (<div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}><div style={{ flex: 1, height: 1, background: "var(--color-border-subtle)" }} /><span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>or</span><div style={{ flex: 1, height: 1, background: "var(--color-border-subtle)" }} /></div>); }
function GoogleIcon() { return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>); }
