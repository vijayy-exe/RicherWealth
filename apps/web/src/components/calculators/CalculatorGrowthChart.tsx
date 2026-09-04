"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { CalculatorChartConfig } from "@/lib/calculators/types";
import { formatCurrency } from "@/lib/calculators/format";

const CustomTooltip = ({ active, payload, label, xLabel }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: number; xLabel: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)", borderRadius: 10, padding: "0.75rem 1rem", backdropFilter: "blur(12px)" }}>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>{xLabel} {label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ fontSize: "0.875rem", fontWeight: 700, color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

export function CalculatorGrowthChart({ config }: { config: CalculatorChartConfig }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={config.data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
        <defs>
          {config.series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="x" tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrency} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<CustomTooltip xLabel={config.xLabel} />} />
        {config.series.length > 1 && <Legend formatter={(value) => <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>{value}</span>} />}
        {config.series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2.5}
            fill={`url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 4, fill: s.color, stroke: "var(--color-bg-base)", strokeWidth: 2 }}
            animationDuration={800}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
