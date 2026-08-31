"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setError(error.message); return; }
      router.push("/login?reset=success");
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="glass-card" style={{ padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--color-text-primary)" }}>Set new password</h1>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: "1.75rem" }}>
        Choose a strong password for your account.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <div role="alert" style={errorStyle}>{error}</div>}
        <div>
          <label htmlFor="reset-password" style={labelStyle}>New password</label>
          <input id="reset-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" style={inputStyle} />
        </div>
        <div>
          <label htmlFor="reset-confirm" style={labelStyle}>Confirm password</label>
          <input id="reset-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" style={inputStyle} />
        </div>
        <button id="btn-reset-password" type="submit" disabled={isLoading} style={primaryBtnStyle}>
          {isLoading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", marginBottom: 6, fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.625rem 0.875rem", background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)", color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none" };
const primaryBtnStyle: React.CSSProperties = { width: "100%", padding: "0.75rem", background: "var(--color-accent)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer" };
const errorStyle: React.CSSProperties = { padding: "0.75rem 1rem", background: "var(--color-loss-muted)", border: "1px solid rgba(255,77,109,0.2)", borderRadius: "var(--radius-md)", color: "var(--color-loss)", fontSize: "0.875rem" };
