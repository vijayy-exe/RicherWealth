"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { convertCurrency } from "@richer/shared-types";
import { createClient } from "@/lib/supabase/client";

const API = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "SGD", "AED", "CHF"];

async function fetchFxRate(from: string, to: string): Promise<number> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const res = await fetch(`${API}/api/calculators/fx-rate?from=${from}&to=${to}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) throw new Error(`Rate lookup failed (${res.status})`);
  const data = await res.json() as { rate: number };
  return data.rate;
}

/**
 * The one calculator whose "formula" needs a live external rate rather than
 * a pure function — reuses Phase 7's CurrencyService via the existing
 * GET /api/calculators/fx-rate endpoint (already built in Phase 13,
 * never actually wired to a frontend component until now). The rate is
 * fetched once per currency-pair change (cached by React Query) and the
 * multiplication itself recomputes live on every keystroke via the shared
 * `convertCurrency` function, matching the "live update, no submit button"
 * convention every other calculator in this app follows.
 */
export function CurrencyCalculator() {
  const [amount, setAmount] = useState(1000);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");

  const { data: rate, isLoading, isError, error } = useQuery({
    queryKey: ["fx-rate", from, to],
    queryFn: () => fetchFxRate(from, to),
    staleTime: 60_000,
  });

  const converted = rate !== undefined ? convertCurrency(amount, rate) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }} className="fx-grid">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="glass-card" style={{ padding: "1.5rem" }}>
        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
          Convert
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.375rem" }}>Amount</label>
            <input
              type="number"
              value={Number.isFinite(amount) ? amount : ""}
              onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
              style={{
                width: "100%", padding: "0.625rem 0.875rem", borderRadius: 10,
                background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
                color: "var(--color-text-primary)", fontSize: "0.9375rem", fontWeight: 600,
              }}
            />
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
            <CurrencySelect label="From" value={from} onChange={setFrom} />
            <button
              type="button"
              onClick={() => { setFrom(to); setTo(from); }}
              aria-label="Swap currencies"
              style={{
                padding: "0.625rem 0.75rem", borderRadius: 10, background: "var(--color-bg-input)",
                border: "1px solid var(--color-border-glass)", color: "var(--color-text-secondary)", cursor: "pointer",
              }}
            >
              ⇄
            </button>
            <CurrencySelect label="To" value={to} onChange={setTo} />
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.1 }} className="glass-card" style={{ padding: "1.5rem" }}>
        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
          Result
        </h3>
        {isLoading && <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>Fetching live rate…</p>}
        {isError && <p style={{ fontSize: "0.875rem", color: "#FF4D6D" }}>{error instanceof Error ? error.message : "Could not fetch exchange rate."}</p>}
        {converted !== null && rate !== undefined && (
          <>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-accent)" }}>
              {converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {to}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
              1 {from} = {rate.toLocaleString("en-US", { maximumFractionDigits: 6 })} {to}
            </div>
          </>
        )}
      </motion.div>

      <style jsx>{`
        @media (min-width: 1024px) {
          .fx-grid { grid-template-columns: 380px 1fr; }
        }
      `}</style>
    </div>
  );
}

function CurrencySelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.375rem" }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "0.625rem 0.875rem", borderRadius: 10,
          background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
          color: "var(--color-text-primary)", fontSize: "0.9375rem", fontWeight: 600,
        }}
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
