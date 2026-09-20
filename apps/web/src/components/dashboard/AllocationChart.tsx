"use client";

import { motion } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";

interface AllocationItem {
  category: string;
  valueInBase: number;
  percentage: number;
}

interface AllocationChartProps {
  data: AllocationItem[];
  currency: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  STOCK: "Stocks",
  MUTUAL_FUND: "Mutual Funds",
  ETF: "ETFs",
  CRYPTO: "Crypto",
  GOLD: "Gold",
  SILVER: "Silver",
  COMMODITY: "Commodities",
  FOREX: "Foreign Currency",
  REAL_ESTATE: "Real Estate",
  FIXED_DEPOSIT: "Fixed Deposits",
  CASH: "Cash",
  BOND: "Bonds",
  RETIREMENT_ACCOUNT: "Retirement",
  INSURANCE: "Insurance",
  CRYPTO_STAKING: "Staking",
  OTHER: "Other",
};

const PALETTE = [
  "#3D83FF", "#00D97E", "#FFB547", "#FF4D6D", "#A78BFA",
  "#38BDF8", "#FB923C", "#34D399", "#F472B6", "#94A3B8",
];

function formatINR(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// Fix Audit B-01 follow-on: the non-INR branch below used to fall back to
// `value.toFixed(0)` -- a bare, unlabeled number with no currency symbol at
// all (e.g. "2607" instead of "$2,607") for every USD/EUR/etc. account.
// formatINR's Lakh/Crore abbreviation stays INR-only by design (it's the
// correct convention there); non-INR now goes through the same shared
// Intl.NumberFormat formatter every other fixed chart in this pass uses.

const CustomTooltip = ({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: AllocationItem }>;
  currency: string;
}) => {
  if (!active || !payload?.length) return null;
  const item = payload[0]!;
  const label = CATEGORY_LABELS[item.payload.category] ?? item.payload.category;
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
      <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-accent)", fontWeight: 600 }}>
        {currency === "INR" ? formatINR(item.payload.valueInBase) : formatCurrency(item.payload.valueInBase, currency)}
      </p>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
        {item.payload.percentage.toFixed(1)}% of portfolio
      </p>
    </div>
  );
};

export function AllocationChart({ data, currency }: AllocationChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    name: CATEGORY_LABELS[d.category] ?? d.category,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.3 }}
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
        Asset Allocation
      </h3>

      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={2}
            dataKey="valueInBase"
            animationBegin={200}
            animationDuration={1000}
          >
            {chartData.map((_, index) => (
              <Cell
                key={index}
                fill={PALETTE[index % PALETTE.length]}
                stroke="transparent"
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Legend
            formatter={(value) => (
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
