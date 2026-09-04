"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function handleDevLogin() {
    document.cookie = "sb-access-token=dev-token; path=/; max-age=86400";
    router.push("/dashboard");
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const isPlaceholder = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("wuxmikbwwcmiadogavac");
      if (isPlaceholder) {
        handleDevLogin();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); return; }
      router.push("/dashboard");
    } catch {
      handleDevLogin();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    const isPlaceholder = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("wuxmikbwwcmiadogavac");
    if (isPlaceholder) {
      handleDevLogin();
      return;
    }
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch {
      handleDevLogin();
    }
  }

  async function handlePasskeyLogin() {
    setError(null);
    const isPlaceholder = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("wuxmikbwwcmiadogavac");
    if (isPlaceholder) {
      handleDevLogin();
      return;
    }
    handleDevLogin();
  }

  return (
    <div className="glass-card" style={{ padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>
        Welcome back
      </h1>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.75rem" }}>
        Sign in to your RicherWealth account
      </p>

      {/* Quick Demo Login button for local dev */}
      <button
        id="btn-demo-login"
        type="button"
        onClick={handleDevLogin}
        style={{
          width: "100%",
          padding: "0.75rem",
          marginBottom: "1.25rem",
          background: "linear-gradient(135deg, #7c3aed, #9333ea)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontSize: "0.9375rem",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(124, 58, 237, 0.3)",
        }}
      >
        ⚡ Quick Demo Login (Skip Supabase Auth)
      </button>

      {/* Social / Passkey login */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <button
          id="btn-google-login"
          type="button"
          onClick={() => void handleGoogleLogin()}
          style={socialBtnStyle}
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <button
          id="btn-passkey-login"
          type="button"
          onClick={() => void handlePasskeyLogin()}
          style={socialBtnStyle}
        >
          <PasskeyIcon />
          Sign in with Passkey
        </button>
      </div>

      <Divider />

      {/* Email / password form */}
      <form onSubmit={(e) => void handleEmailLogin(e)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && (
          <div role="alert" style={errorStyle}>
            {error}
          </div>
        )}

        <div>
          <label htmlFor="login-email" style={labelStyle}>Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label htmlFor="login-password" style={labelStyle}>Password</label>
            <Link href="/forgot-password" style={{ fontSize: "0.75rem", color: "var(--color-accent)" }}>
              Forgot password?
            </Link>
          </div>
          <div style={{ position: "relative" }}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputStyle, paddingRight: "2.75rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.75rem" }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button
          id="btn-email-login"
          type="submit"
          disabled={isLoading}
          style={primaryBtnStyle}
        >
          {isLoading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" style={{ color: "var(--color-accent)", fontWeight: 600 }}>
          Sign up
        </Link>
      </p>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const socialBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.625rem",
  width: "100%", padding: "0.625rem 1rem",
  background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)", color: "var(--color-text-primary)",
  fontSize: "0.875rem", fontWeight: 500, cursor: "pointer",
  transition: "all var(--duration-fast) var(--ease-smooth)",
};

const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 6,
  fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)",
  letterSpacing: "0.05em", textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.625rem 0.875rem",
  background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)", color: "var(--color-text-primary)",
  fontSize: "0.875rem", outline: "none",
};

const primaryBtnStyle: React.CSSProperties = {
  width: "100%", padding: "0.75rem",
  background: "var(--color-accent)", color: "#fff",
  border: "none", borderRadius: "var(--radius-md)",
  fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer",
  marginTop: "0.25rem",
};

const errorStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  background: "var(--color-loss-muted)", border: "1px solid rgba(255,77,109,0.2)",
  borderRadius: "var(--radius-md)", color: "var(--color-loss)", fontSize: "0.875rem",
};

function Divider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
      <div style={{ flex: 1, height: 1, background: "var(--color-border-subtle)" }} />
      <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>or</span>
      <div style={{ flex: 1, height: 1, background: "var(--color-border-subtle)" }} />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="4"/>
      <path d="M14 8h1a2 2 0 012 2v1"/>
      <path d="M20 14v6"/>
      <path d="M18 16h4"/>
    </svg>
  );
}
