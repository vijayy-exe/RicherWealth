"use client";

import { motion } from "framer-motion";
import { useSubscriptions } from "@/hooks/useTransactions";

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Math.abs(value));
}

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly", ANNUALLY: "Annually", IRREGULAR: "Recurring",
};

export function SubscriptionsPanel() {
  const { data: subscriptions = [], isLoading } = useSubscriptions();

  if (isLoading) return null;
  if (subscriptions.length === 0) return null;

  const monthlyTotal = subscriptions.reduce((sum, s) => {
    const multiplier = s.estimatedFrequency === "WEEKLY" ? 52 / 12 : s.estimatedFrequency === "QUARTERLY" ? 1 / 3 : s.estimatedFrequency === "ANNUALLY" ? 1 / 12 : 1;
    return sum + Math.abs(s.amount) * multiplier;
  }, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
        <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Detected Subscriptions ({subscriptions.length})
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          ≈ {formatCurrency(monthlyTotal, subscriptions[0]?.currencyCode ?? "USD")}/mo total
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {subscriptions.map((sub) => (
          <div
            key={`${sub.merchant}-${sub.amount}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0.75rem 1rem", background: "var(--color-bg-input, rgba(255,255,255,0.03))", borderRadius: "var(--radius-md)",
            }}
          >
            <div>
              <p style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.875rem" }}>{sub.merchant}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {FREQUENCY_LABEL[sub.estimatedFrequency] ?? sub.estimatedFrequency} · {sub.occurrences} charges since{" "}
                {new Date(sub.firstDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              </p>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-loss)" }}>
              {formatCurrency(sub.amount, sub.currencyCode)}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
