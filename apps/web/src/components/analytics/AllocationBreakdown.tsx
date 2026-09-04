"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Treemap } from "recharts";
import type { AllocationDimension, AllocationReport } from "@/hooks/useAnalytics";

const DIMENSION_LABELS: Record<string, string> = {
  assetClass: "Asset Class",
  sector: "Sector",
  geography: "Geography",
  currency: "Currency",
  marketCap: "Market Cap",
};

const PALETTE = [
  "#3D83FF", "#00D97E", "#FFB547", "#FF4D6D", "#A78BFA",
  "#38BDF8", "#FB923C", "#34D399", "#F472B6", "#94A3B8",
];

function formatCompact(value: number) {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

function DiversificationBadge({ score }: { score: number }) {
  const color = score >= 65 ? "#00D97E" : score >= 40 ? "#FFB547" : "#FF4D6D";
  const label = score >= 65 ? "Well diversified" : score >= 40 ? "Moderately concentrated" : "Highly concentrated";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div
        style={{
          width: 10, height: 10, borderRadius: "50%", background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>
        {score.toFixed(0)}/100 &middot; {label}
      </span>
    </div>
  );
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; payload: { label: string; value: number; weight: number } }> }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0]!.payload;
  return (
    <div
      style={{
        background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)",
        borderRadius: 10, padding: "0.75rem 1rem", backdropFilter: "blur(12px)",
      }}
    >
      <p style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>{item.label}</p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-accent)", fontWeight: 600 }}>{formatCompact(item.value)}</p>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{(item.weight * 100).toFixed(1)}% of portfolio</p>
    </div>
  );
};

function DimensionChart({ dim, view }: { dim: AllocationDimension; view: "pie" | "treemap" }) {
  const data = dim.groups.map((g) => ({ ...g, name: g.label }));

  if (view === "treemap") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <Treemap
          data={data}
          dataKey="value"
          nameKey="label"
          stroke="var(--color-bg-card)"
          fill="#3D83FF"
          animationDuration={800}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={65}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          animationBegin={100}
          animationDuration={800}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={(value) => <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function AllocationBreakdown({ report }: { report: AllocationReport }) {
  const dimensions = Object.keys(report.byDimension);
  const [activeDim, setActiveDim] = useState(dimensions[0] ?? "assetClass");
  const [view, setView] = useState<"pie" | "treemap">("pie");
  const active = report.byDimension[activeDim];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.375rem" }}>
            Allocation &amp; Diversification
          </h3>
          <DiversificationBadge score={report.overallDiversificationScore} />
        </div>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          {(["pie", "treemap"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "0.375rem 0.75rem", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600,
                border: "1px solid var(--color-border-glass)", cursor: "pointer",
                background: view === v ? "var(--color-accent)" : "transparent",
                color: view === v ? "#fff" : "var(--color-text-secondary)",
                textTransform: "capitalize",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {dimensions.map((dim) => (
          <button
            key={dim}
            onClick={() => setActiveDim(dim)}
            style={{
              padding: "0.375rem 0.875rem", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600,
              border: "1px solid var(--color-border-glass)", cursor: "pointer",
              background: activeDim === dim ? "var(--color-bg-input)" : "transparent",
              color: activeDim === dim ? "var(--color-text-primary)" : "var(--color-text-muted)",
            }}
          >
            {DIMENSION_LABELS[dim] ?? dim}
          </button>
        ))}
      </div>

      {active && active.groups.length > 0 ? (
        <>
          <DimensionChart dim={active} view={view} />
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textAlign: "center", marginTop: "0.5rem" }}>
            {DIMENSION_LABELS[activeDim] ?? activeDim} diversification: {active.diversificationScore.toFixed(0)}/100
          </p>
        </>
      ) : (
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", textAlign: "center", padding: "2rem 0" }}>
          No holdings yet for this breakdown.
        </p>
      )}
    </motion.div>
  );
}
