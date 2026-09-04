"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { AnyRiskSubScore } from "@/hooks/useRisk";
import { isInsufficientRiskSubScore } from "@/hooks/useRisk";

// Loaded client-side only — echarts touches `window`/canvas at import time,
// which breaks Next.js's server render pass otherwise (same as Phase 11's
// CorrelationHeatmap/MonteCarloFanChart).
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

function levelColor(score: number): string {
  if (score < 25) return "#00D97E"; // low — matches --color-gain
  if (score < 50) return "#FFB547"; // moderate
  if (score < 75) return "#FF8A3D"; // elevated
  return "#FF4D6D"; // high — matches --color-loss
}

export function RiskRadarChart({ subScores, overallScore }: { subScores: AnyRiskSubScore[]; overallScore: number | null }) {
  const indicators = subScores.map((s) => ({ name: s.label, max: 100 }));
  const values = subScores.map((s) => (isInsufficientRiskSubScore(s) ? 0 : s.score));
  const insufficientCount = subScores.filter(isInsufficientRiskSubScore).length;
  const color = overallScore !== null ? levelColor(overallScore) : "#5C6880";

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      backgroundColor: "rgba(20, 24, 38, 0.95)",
      borderColor: "rgba(255,255,255,0.1)",
      textStyle: { color: "#F0F4FF", fontSize: 12 },
      formatter: (p) => {
        const params = p as unknown as { value: number[] };
        return subScores
          .map((s, i) => `${s.label}: ${isInsufficientRiskSubScore(s) ? "no data" : `${params.value[i]?.toFixed(0)}/100`}`)
          .join("<br/>");
      },
    },
    radar: {
      indicator: indicators,
      shape: "polygon",
      splitNumber: 4,
      axisName: { color: "#A8B4CF", fontSize: 12 },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      splitArea: { areaStyle: { color: ["rgba(255,255,255,0.02)", "rgba(255,255,255,0.05)"] } },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.15)" } },
    },
    series: [
      {
        type: "radar",
        data: [
          {
            value: values,
            name: "Risk profile",
            areaStyle: { color, opacity: 0.25 },
            lineStyle: { color, width: 2 },
            itemStyle: { color },
          },
        ],
      },
    ],
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Risk Profile
        </h3>
        {overallScore !== null && (
          <span style={{ fontSize: "1.5rem", fontWeight: 800, color }}>
            {overallScore.toFixed(0)}<span style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", fontWeight: 600 }}>/100</span>
          </span>
        )}
      </div>
      <ReactECharts option={option} style={{ height: 360 }} notMerge />
      {insufficientCount > 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
          {insufficientCount} of {subScores.length}{" "}
          dimensions don&apos;t have enough data yet — shown at 0 on the chart and excluded from the overall score below.
        </p>
      )}
    </motion.div>
  );
}

export function RiskRadarEmptyState() {
  return (
    <div className="glass-card" style={{ padding: "2.5rem", textAlign: "center" }}>
      <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
        Not enough data for a risk profile yet
      </p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
        Add some holdings and liabilities to see your risk breakdown here.
      </p>
    </div>
  );
}
