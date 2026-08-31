"use client";

import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SnapshotPoint {
  date: string;
  netWorth: number;
}

interface TrendChartProps {
  data: SnapshotPoint[];
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const CustomTooltip = ({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  currency: string;
}) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  const formatted =
    currency === "INR"
      ? value >= 100_000
        ? `₹${(value / 100_000).toFixed(2)}L`
        : `₹${value.toFixed(0)}`
      : `${value.toFixed(0)}`;

  return (
    <div
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-glass)",
        borderRadius: 10,
        padding: "0.75rem 1rem",
        backdropFilter: "blur(12px)",
      }}
    >
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
        {label ? formatDate(label) : ""}
      </p>
      <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-accent)" }}>
        {formatted}
      </p>
    </div>
  );
};

export function TrendChart({ data, currency }: TrendChartProps) {
  const isGrowing = data.length >= 2
    ? (data[data.length - 1]?.netWorth ?? 0) >= (data[0]?.netWorth ?? 0)
    : true;

  const strokeColor = isGrowing ? "#00D97E" : "#FF4D6D";
  const gradientId = "netWorthGradient";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <h3
        style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: "1.5rem",
        }}
      >
        Net Worth Trend — 12 Months
      </h3>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatYAxis(v, currency)}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke={strokeColor}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 5, fill: strokeColor, stroke: "var(--color-bg-base)", strokeWidth: 2 }}
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
