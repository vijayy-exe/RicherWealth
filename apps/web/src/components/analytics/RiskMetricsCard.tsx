"use client";

import { motion } from "framer-motion";
import type { RiskMetrics } from "@/hooks/useAnalytics";

function Metric({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "1.5rem", fontWeight: 800,
          color: good === true ? "#00D97E" : good === false ? "#FF4D6D" : "var(--color-text-primary)",
        }}
      >
        {value}
      </span>
      {hint && <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{hint}</span>}
    </div>
  );
}

export function RiskMetricsCard({ metrics, benchmarkLabel }: { metrics: RiskMetrics; benchmarkLabel: string }) {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const ratio = (v: number) => v.toFixed(2);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
        Risk Metrics <span style={{ color: "var(--color-text-secondary)", textTransform: "none", fontWeight: 500 }}>vs {benchmarkLabel}</span>
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "1.25rem 1rem" }}>
        <Metric label="Beta" value={ratio(metrics.beta)} hint={metrics.beta > 1 ? "More volatile than benchmark" : "Less volatile than benchmark"} />
        <Metric label="Alpha (daily)" value={pct(metrics.alpha)} good={metrics.alpha > 0} hint={metrics.alpha > 0 ? "Outperforming, risk-adjusted" : "Underperforming, risk-adjusted"} />
        <Metric label="Sharpe Ratio" value={ratio(metrics.sharpeRatio)} good={metrics.sharpeRatio > 1} hint={metrics.sharpeRatio > 1 ? "Good risk-adjusted return" : "Weak risk-adjusted return"} />
        <Metric label="Sortino Ratio" value={ratio(metrics.sortinoRatio)} good={metrics.sortinoRatio > 1} hint="Downside-risk-adjusted return" />
        <Metric label="Treynor Ratio" value={ratio(metrics.treynorRatio)} hint="Return per unit of market risk" />
        <Metric label="Volatility (ann.)" value={pct(metrics.volatility)} hint="Annualized standard deviation" />
        <Metric label="Std Dev (daily)" value={pct(metrics.stdDev)} />
        <Metric
          label="Max Drawdown"
          value={metrics.maxDrawdown !== null ? pct(metrics.maxDrawdown) : "—"}
          good={metrics.maxDrawdown !== null ? metrics.maxDrawdown > -0.2 : null}
          hint="Largest peak-to-trough decline"
        />
      </div>
    </motion.div>
  );
}

export function RiskMetricsEmptyState({ reason }: { reason: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem" }}>
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
        Risk Metrics
      </h3>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{reason}</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.5rem" }}>
        Risk metrics need at least a few weeks of historical price data across your holdings — add stocks, ETFs,
        or mutual funds with price history to see this.
      </p>
    </div>
  );
}
