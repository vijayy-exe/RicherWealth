"use client";

import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { CashFlowMonth } from "@/hooks/useTransactions";

interface CashFlowChartProps {
  data: CashFlowMonth[];
  currency: string;
}

function formatYAxis(value: number, currency: string): string {
  if (currency === "INR") {
    if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
    if (value >= 100_000) return `${(value / 100_000).toFixed(0)}L`;
    return `${(value / 1000).toFixed(0)}K`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  if (!year || !m) return month;
  return new Date(parseInt(year, 10), parseInt(m, 10) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const CustomTooltip = ({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string; currency: string }) => {
  if (!active || !payload?.length) return null;
  const fmt = (v: number) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  return (
    <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)", borderRadius: 10, padding: "0.75rem 1rem", backdropFilter: "blur(12px)" }}>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 6 }}>{label ? formatMonth(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontSize: "0.875rem", fontWeight: 700, color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

export function CashFlowChart({ data, currency }: CashFlowChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
        Cash Flow — Income vs. Expenses
      </h3>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v: number) => formatYAxis(v, currency)} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
          <Bar dataKey="income" name="Income" fill="#00D97E" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill="#FF4D6D" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
