"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { CorrelationMatrix } from "@/hooks/useAnalytics";

// Loaded client-side only — echarts touches `window`/canvas at import time,
// which breaks Next.js's server render pass otherwise.
const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function CorrelationHeatmap({ data }: { data: CorrelationMatrix }) {
  const { labels, matrix } = data;
  const cells: [number, number, number][] = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < labels.length; j++) {
      cells.push([j, i, Math.round((matrix[i]![j] ?? 0) * 100) / 100]);
    }
  }

  const option: EChartsOption = {
    backgroundColor: "transparent",
    grid: { top: 10, right: 10, bottom: 70, left: 90 },
    tooltip: {
      position: "top",
      backgroundColor: "rgba(20, 24, 38, 0.95)",
      borderColor: "rgba(255,255,255,0.1)",
      textStyle: { color: "#F0F4FF", fontSize: 12 },
      formatter: (p) => {
        const [x, y, v] = (p as unknown as { data: [number, number, number] }).data;
        return `${labels[y]} &harr; ${labels[x]}<br/><b>${v.toFixed(2)}</b>`;
      },
    },
    xAxis: {
      type: "category", data: labels, splitArea: { show: false },
      axisLabel: { color: "#8891A8", fontSize: 11, rotate: 45 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
    },
    yAxis: {
      type: "category", data: labels, splitArea: { show: false },
      axisLabel: { color: "#8891A8", fontSize: 11 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
    },
    visualMap: {
      min: -1, max: 1, calculable: true, orient: "horizontal",
      left: "center", bottom: 0,
      textStyle: { color: "#8891A8", fontSize: 11 },
      inRange: { color: ["#FF4D6D", "rgba(255,255,255,0.06)", "#00D97E"] },
    },
    series: [{
      type: "heatmap",
      data: cells,
      label: { show: true, color: "#F0F4FF", fontSize: 11, fontWeight: 600 },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" } },
      // ECharts renders to canvas, not the DOM, so CSS custom properties
      // (var(--...)) don't resolve here the way they would on a real
      // element — this must be an actual color value. #090E1A matches
      // --color-bg-base exactly (see design-tokens.css) rather than being
      // a separate guess, so the heatmap cell borders blend into the page.
      itemStyle: { borderColor: "#090E1A", borderWidth: 2 },
    }],
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
        Correlation Matrix
      </h3>
      <ReactECharts option={option} style={{ height: Math.max(320, labels.length * 36 + 140) }} notMerge />
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
        Based on daily returns over the overlapping historical window across your holdings. +1 = move together, -1 = move oppositely.
      </p>
    </motion.div>
  );
}

export function CorrelationEmptyState({ reason }: { reason: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem" }}>
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
        Correlation Matrix
      </h3>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{reason}</p>
    </div>
  );
}
