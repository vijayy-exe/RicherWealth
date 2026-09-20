"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { ScenarioSimulationResult } from "@/hooks/useWealth";
import { formatCurrency } from "@/lib/format";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Overlays the baseline (no-shock) median path against the chosen
 * scenario's median path on the SAME axes — plus the scenario's own
 * 5th-95th percentile fan — so a market crash vs. a salary increase read as
 * visibly, immediately different lines on the same portfolio (the literal
 * acceptance criterion for this feature).
 */
export function ScenarioComparisonChart({
  result,
  currency,
}: {
  result: ScenarioSimulationResult;
  /** The account's real baseCurrency — see Fix Audit B-01: this chart
   * shared MonteCarloFanChart's same hardcoded-₹ bug, verbatim. */
  currency: string;
}) {
  const months = Array.from({ length: result.horizonMonths + 1 }, (_, i) => i);
  const baseP50 = result.baseline.percentiles["50"] ?? result.baseline.mean;
  const p5 = result.scenario.percentiles["5"] ?? [];
  const p50 = result.scenario.percentiles["50"] ?? result.scenario.mean;
  const p95 = result.scenario.percentiles["95"] ?? [];
  const band5to95 = p95.map((v, i) => v - (p5[i] ?? 0));

  const option: EChartsOption = {
    backgroundColor: "transparent",
    grid: { top: 30, right: 24, bottom: 40, left: 70 },
    legend: {
      data: ["Baseline (no shock)", "Scenario"],
      top: 0,
      textStyle: { color: "#A8B4CF", fontSize: 11 },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(20, 24, 38, 0.95)",
      borderColor: "rgba(255,255,255,0.1)",
      textStyle: { color: "#F0F4FF", fontSize: 12 },
      formatter: (params) => {
        const arr = params as unknown as Array<{ dataIndex: number }>;
        const i = arr[0]?.dataIndex ?? 0;
        return [`Month ${months[i]}`, `Baseline: ${formatCurrency(baseP50[i] ?? 0, currency)}`, `Scenario: ${formatCurrency(p50[i] ?? 0, currency)}`].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: months.map((m) => (m % 12 === 0 ? `${(m / 12).toFixed(0)}y` : "")),
      axisLabel: { color: "#8891A8", fontSize: 11, interval: 11 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#8891A8", fontSize: 11, formatter: (v: number) => formatCurrency(v, currency) },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
    },
    series: [
      { name: "base", type: "line", data: p5, stack: "fan", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { opacity: 0 }, silent: true },
      { name: "5-95", type: "line", data: band5to95, stack: "fan", lineStyle: { opacity: 0 }, showSymbol: false, areaStyle: { color: "rgba(255, 138, 61, 0.15)" }, silent: true },
      { name: "Baseline (no shock)", type: "line", data: baseP50, showSymbol: false, lineStyle: { color: "#3D83FF", width: 2, type: "dashed" } },
      { name: "Scenario", type: "line", data: p50, showSymbol: false, lineStyle: { color: "#FF8A3D", width: 2.5 } },
    ],
  };

  const scenarioDelta = result.scenario.finalValueStats.mean - result.baseline.finalValueStats.mean;
  const scenarioDeltaPct = result.baseline.finalValueStats.mean !== 0 ? (scenarioDelta / result.baseline.finalValueStats.mean) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="glass-card" style={{ padding: "1.5rem" }}>
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1rem" }}>
        Baseline vs. Scenario
      </h3>
      <ReactECharts option={option} style={{ height: 340 }} notMerge />
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border-glass)" }}>
        <StatBlock label="Baseline median outcome" value={formatCurrency(result.baseline.finalValueStats.mean, currency)} />
        <StatBlock label="Scenario median outcome" value={formatCurrency(result.scenario.finalValueStats.mean, currency)} />
        <StatBlock
          label="Difference vs. baseline"
          value={`${scenarioDelta >= 0 ? "+" : ""}${formatCurrency(scenarioDelta, currency)} (${scenarioDeltaPct >= 0 ? "+" : ""}${scenarioDeltaPct.toFixed(1)}%)`}
          color={scenarioDelta >= 0 ? "var(--color-gain)" : "var(--color-loss)"}
        />
      </div>
      {result.isAssumedReturn && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.75rem" }}>
          No real return history yet — using an assumed {result.assumedAnnualReturnPct}% annual return / {result.assumedAnnualVolatilityPct}% volatility.
        </p>
      )}
    </motion.div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: color ?? "var(--color-text-primary)" }}>{value}</div>
    </div>
  );
}
