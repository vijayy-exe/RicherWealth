"use client";

import { useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) { setError(error.message); return; }
      setSent(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="glass-card" style={{ padding: "2rem", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📬</div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>Reset link sent</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
          Check your email for a password reset link. It expires in 60 minutes.
        </p>
        <Link href="/login" style={{ display: "inline-block", marginTop: "1.5rem", color: "var(--color-accent)", fontSize: "0.875rem" }}>
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>Reset password</h1>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.75rem" }}>
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <div role="alert" style={errorStyle}>{error}</div>}
        <div>
          <label htmlFor="forgot-email" style={labelStyle}>Email</label>
          <input id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
        </div>
        <button id="btn-send-reset" type="submit" disabled={isLoading} style={primaryBtnStyle}>
          {isLoading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
        <Link href="/login" style={{ color: "var(--color-accent)" }}>← Back to sign in</Link>
      </p>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", marginBottom: 6, fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.625rem 0.875rem", background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)", color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none" };
const primaryBtnStyle: React.CSSProperties = { width: "100%", padding: "0.75rem", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: "0.75rem 1rem", background: "var(--color-loss-muted)", border: "1px solid rgba(255,77,109,0.2)", borderRadius: "var(--radius-md)", color: "var(--color-loss)", fontSize: "0.875rem" };
