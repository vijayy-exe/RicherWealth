"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { AnyWealthHealthSubScore } from "@/hooks/useWealth";
import { isInsufficientWealthHealthSubScore } from "@/hooks/useWealth";

// Loaded client-side only — echarts touches `window`/canvas at import time,
// same convention as RiskRadarChart/MonteCarloFanChart.
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/** 100 = HEALTHIEST here (the opposite of RiskRadarChart's 100 = riskiest),
 * so the color ramp is mirror-imaged: low score reads as alarming red,
 * high score reads as reassuring green. */
function levelColor(score: number): string {
  if (score < 40) return "#FF4D6D"; // critical
  if (score < 60) return "#FF8A3D"; // needsAttention
  if (score < 80) return "#FFB547"; // good
  return "#00D97E"; // excellent
}

export function WealthHealthRadarChart({ subScores, overallScore }: { subScores: AnyWealthHealthSubScore[]; overallScore: number | null }) {
  const indicators = subScores.map((s) => ({ name: s.label, max: 100 }));
  const values = subScores.map((s) => (isInsufficientWealthHealthSubScore(s) ? 0 : s.score));
  const insufficientCount = subScores.filter(isInsufficientWealthHealthSubScore).length;
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
          .map((s, i) => `${s.label}: ${isInsufficientWealthHealthSubScore(s) ? "no data" : `${params.value[i]?.toFixed(0)}/100`}`)
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
            name: "Wealth health",
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
          Wealth Health Score
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

export function WealthHealthRadarEmptyState() {
  return (
    <div className="glass-card" style={{ padding: "2.5rem", textAlign: "center" }}>
      <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
        Not enough data for a Wealth Health Score yet
      </p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
        Add holdings, income, and a goal or two to see your score breakdown here.
      </p>
    </div>
  );
}
