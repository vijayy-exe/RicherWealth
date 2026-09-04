"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { RefreshCw } from "lucide-react";
import type { MonteCarloResult } from "@/hooks/useAnalytics";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

function formatCurrency(v: number) {
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(v) >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function MonteCarloFanChart({
  result,
  years,
  onYearsChange,
  onRefresh,
  refreshing,
}: {
  result: MonteCarloResult;
  years: number;
  onYearsChange: (y: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const days = Array.from({ length: result.periods + 1 }, (_, i) => i);
  const p5 = result.percentiles["5"] ?? [];
  const p25 = result.percentiles["25"] ?? [];
  const p50 = result.percentiles["50"] ?? [];
  const p75 = result.percentiles["75"] ?? [];
  const p95 = result.percentiles["95"] ?? [];

  // ECharts "fan chart" trick: stack a transparent base (p5) then visible
  // bands on top as the DELTA between percentiles, so each band's stacked
  // top lands exactly on the next percentile line.
  const band5to25 = p25.map((v, i) => v - (p5[i] ?? 0));
  const band25to75 = p75.map((v, i) => v - (p25[i] ?? 0));
  const band75to95 = p95.map((v, i) => v - (p75[i] ?? 0));

  const option: EChartsOption = {
    backgroundColor: "transparent",
    grid: { top: 20, right: 24, bottom: 40, left: 70 },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(20, 24, 38, 0.95)",
      borderColor: "rgba(255,255,255,0.1)",
      textStyle: { color: "#F0F4FF", fontSize: 12 },
      formatter: (params) => {
        const arr = params as unknown as Array<{ dataIndex: number }>;
        const i = arr[0]?.dataIndex ?? 0;
        return [
          `Day ${days[i]}`,
          `95th: ${formatCurrency(p95[i] ?? 0)}`,
          `75th: ${formatCurrency(p75[i] ?? 0)}`,
          `Median: ${formatCurrency(p50[i] ?? 0)}`,
          `25th: ${formatCurrency(p25[i] ?? 0)}`,
          `5th: ${formatCurrency(p5[i] ?? 0)}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: days.map((d) => (d % 63 === 0 ? `${(d / 252).toFixed(1)}y` : "")),
      axisLabel: { color: "#8891A8", fontSize: 11, interval: 62 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#8891A8", fontSize: 11, formatter: (v: number) => formatCurrency(v) },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
    },
    series: [
      { name: "base", type: "line", data: p5, stack: "fan", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { opacity: 0 } },
      { name: "5-25", type: "line", data: band5to25, stack: "fan", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: "rgba(61, 131, 255, 0.12)" } },
      { name: "25-75", type: "line", data: band25to75, stack: "fan", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: "rgba(61, 131, 255, 0.3)" } },
      { name: "75-95", type: "line", data: band75to95, stack: "fan", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: "rgba(61, 131, 255, 0.12)" } },
      { name: "Median", type: "line", data: p50, showSymbol: false, lineStyle: { color: "#3D83FF", width: 2.5 } },
    ],
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            Monte Carlo Projection {result.cached && <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>(cached)</span>}
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <select
            value={years}
            onChange={(e) => onYearsChange(Number(e.target.value))}
            style={{
              background: "var(--color-bg-input)", color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-glass)", borderRadius: 8,
              padding: "0.375rem 0.625rem", fontSize: "0.8125rem",
            }}
          >
            {[1, 3, 5, 10, 20, 30].map((y) => (
              <option key={y} value={y}>{y} year{y > 1 ? "s" : ""}</option>
            ))}
          </select>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Recompute projection with fresh data"
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "0.375rem 0.75rem", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600,
              border: "1px solid var(--color-border-glass)", cursor: refreshing ? "default" : "pointer",
              background: "transparent", color: "var(--color-text-secondary)", opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} className={refreshing ? "spin" : ""} />
            {refreshing ? "Computing..." : "Recompute"}
          </button>
        </div>
      </div>

      <ReactECharts option={option} style={{ height: 340 }} notMerge />

      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border-glass)" }}>
        <StatBlock label="Median outcome" value={formatCurrency(result.finalValueStats.mean)} />
        <StatBlock label="Best case (max)" value={formatCurrency(result.finalValueStats.max)} />
        <StatBlock label="Worst case (min)" value={formatCurrency(result.finalValueStats.min)} />
      </div>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </motion.div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{value}</div>
    </div>
  );
}

export function MonteCarloEmptyState({ reason }: { reason: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem" }}>
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
        Monte Carlo Projection
      </h3>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{reason}</p>
    </div>
  );
}

export function MonteCarloLoadingState() {
  return (
    <div className="glass-card" style={{ padding: "1.5rem", minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
      <RefreshCw size={20} color="var(--color-accent)" className="spin" style={{ animation: "spin 1s linear infinite" }} />
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Running simulation...</p>
      <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
