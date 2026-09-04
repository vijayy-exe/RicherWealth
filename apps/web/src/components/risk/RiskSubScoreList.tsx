"use client";

import { motion } from "framer-motion";
import type { AnyRiskSubScore, RiskLevel } from "@/hooks/useRisk";
import { isInsufficientRiskSubScore } from "@/hooks/useRisk";

const LEVEL_COLOR: Record<RiskLevel, string> = {
  low: "#00D97E",
  moderate: "#FFB547",
  elevated: "#FF8A3D",
  high: "#FF4D6D",
};

const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  elevated: "Elevated",
  high: "High",
};

function SubScoreRow({ subScore, index }: { subScore: AnyRiskSubScore; index: number }) {
  const insufficient = isInsufficientRiskSubScore(subScore);
  const color = insufficient ? "var(--color-text-muted)" : LEVEL_COLOR[subScore.level];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      style={{
        display: "flex", flexDirection: "column", gap: "0.5rem",
        padding: "1rem 1.25rem", borderRadius: 12,
        background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{subScore.label}</span>
        {insufficient ? (
          <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            No data
          </span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.125rem", fontWeight: 800, color }}>{subScore.score.toFixed(0)}</span>
            <span
              style={{
                fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                padding: "0.125rem 0.5rem", borderRadius: 999, color, background: `${color}22`,
              }}
            >
              {LEVEL_LABEL[subScore.level]}
            </span>
          </div>
        )}
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        {insufficient ? subScore.reason : subScore.explanation}
      </p>
    </motion.div>
  );
}

export function RiskSubScoreList({ subScores }: { subScores: AnyRiskSubScore[] }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem" }}>
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
        What&apos;s Driving Your Score
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {subScores.map((s, i) => (
          <SubScoreRow key={s.key} subScore={s} index={i} />
        ))}
      </div>
    </div>
  );
}
