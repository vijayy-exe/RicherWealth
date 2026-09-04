"use client";

import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { RiskTrendPoint } from "@/hooks/useRisk";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function levelColor(score: number): string {
  if (score < 25) return "#00D97E";
  if (score < 50) return "#FFB547";
  if (score < 75) return "#FF8A3D";
  return "#FF4D6D";
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)", borderRadius: 10, padding: "0.75rem 1rem", backdropFilter: "blur(12px)" }}>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>{label ? formatDate(label) : ""}</p>
      <p style={{ fontSize: "1rem", fontWeight: 700, color: levelColor(value) }}>{value.toFixed(0)}/100</p>
    </div>
  );
};

export function RiskTrendChart({ data }: { data: RiskTrendPoint[] }) {
  const latest = data[data.length - 1]?.overallScore ?? 0;
  const strokeColor = levelColor(latest);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.5rem" }}>
        Risk Score Trend
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="riskTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "var(--color-text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
          <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="overallScore"
            stroke={strokeColor}
            strokeWidth={2.5}
            fill="url(#riskTrendGradient)"
            dot={false}
            activeDot={{ r: 5, fill: strokeColor, stroke: "var(--color-bg-base)", strokeWidth: 2 }}
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

export function RiskTrendEmptyState() {
  return (
    <div className="glass-card" style={{ padding: "1.5rem" }}>
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
        Risk Score Trend
      </h3>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
        Your risk score is recorded once a day — check back tomorrow to start seeing a trend.
      </p>
    </div>
  );
}
