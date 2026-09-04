"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAllocation, useRiskMetrics, useCorrelationMatrix, useMonteCarlo, useRefreshMonteCarlo, isInsufficientData, type MonteCarloResult, type InsufficientData } from "@/hooks/useAnalytics";
import { AllocationBreakdown } from "@/components/analytics/AllocationBreakdown";
import { RiskMetricsCard, RiskMetricsEmptyState } from "@/components/analytics/RiskMetricsCard";
import { CorrelationHeatmap, CorrelationEmptyState } from "@/components/analytics/CorrelationHeatmap";
import { MonteCarloFanChart, MonteCarloEmptyState, MonteCarloLoadingState } from "@/components/analytics/MonteCarloFanChart";
import { useQueryClient } from "@tanstack/react-query";

function CardSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem", minHeight: height }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ height: 10, width: "35%", background: "var(--color-bg-input)", borderRadius: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: height - 60, width: "100%", background: "var(--color-bg-input)", borderRadius: 8, animation: "pulse 1.5s ease-in-out 0.1s infinite", opacity: 0.5 }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [years, setYears] = useState(10);
  const [benchmark] = useState<{ ticker: string; label: string }>({ ticker: "SPY", label: "S&P 500 (SPY)" });
  const [refreshing, setRefreshing] = useState(false);

  const allocation = useAllocation();
  const riskMetrics = useRiskMetrics(benchmark.ticker);
  const correlation = useCorrelationMatrix();
  const monteCarlo = useMonteCarlo(years);
  const refreshMonteCarlo = useRefreshMonteCarlo();
  const queryClient = useQueryClient();

  async function handleRefreshMonteCarlo() {
    setRefreshing(true);
    try {
      const fresh = await refreshMonteCarlo(years);
      queryClient.setQueryData(["analytics", "monte-carlo", years, 10_000], fresh);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
          Portfolio Analytics
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
          Allocation, risk-adjusted returns, correlation, and a forward-looking projection — computed by the quant engine.
        </p>
      </motion.div>

      {/* Allocation */}
      {allocation.isLoading ? (
        <CardSkeleton height={420} />
      ) : allocation.isError ? (
        <ErrorCard message={(allocation.error as Error).message} />
      ) : allocation.data && allocation.data.totalValue > 0 ? (
        <AllocationBreakdown report={allocation.data} />
      ) : (
        <EmptyPortfolioCard />
      )}

      {/* Risk metrics + Correlation, side by side on wide screens */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }} className="analytics-grid">
        {riskMetrics.isLoading ? (
          <CardSkeleton height={220} />
        ) : riskMetrics.isError ? (
          <ErrorCard message={(riskMetrics.error as Error).message} />
        ) : riskMetrics.data && !isInsufficientData(riskMetrics.data) ? (
          <RiskMetricsCard metrics={riskMetrics.data} benchmarkLabel={benchmark.label} />
        ) : (
          <RiskMetricsEmptyState reason={(riskMetrics.data as InsufficientData | undefined)?.reason ?? "Not enough data yet."} />
        )}

        {correlation.isLoading ? (
          <CardSkeleton height={380} />
        ) : correlation.isError ? (
          <ErrorCard message={(correlation.error as Error).message} />
        ) : correlation.data && !isInsufficientData(correlation.data) ? (
          <CorrelationHeatmap data={correlation.data} />
        ) : (
          <CorrelationEmptyState reason={(correlation.data as InsufficientData | undefined)?.reason ?? "Need at least 2 holdings with price history."} />
        )}
      </div>

      {/* Monte Carlo */}
      {monteCarlo.isLoading || refreshing ? (
        <MonteCarloLoadingState />
      ) : monteCarlo.isError ? (
        <ErrorCard message={(monteCarlo.error as Error).message} />
      ) : monteCarlo.data && !isInsufficientData(monteCarlo.data) ? (
        <MonteCarloFanChart
          result={monteCarlo.data as MonteCarloResult}
          years={years}
          onYearsChange={setYears}
          onRefresh={handleRefreshMonteCarlo}
          refreshing={refreshing}
        />
      ) : (
        <MonteCarloEmptyState reason={(monteCarlo.data as InsufficientData | undefined)?.reason ?? "Not enough historical data to project forward yet."} />
      )}

      <style jsx>{`
        @media (min-width: 1024px) {
          .analytics-grid { grid-template-columns: 1fr 1.3fr; }
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem", borderColor: "rgba(255, 77, 109, 0.3)" }}>
      <p style={{ fontSize: "0.875rem", color: "#FF4D6D", fontWeight: 600 }}>Couldn&apos;t load this section</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{message}</p>
    </div>
  );
}

function EmptyPortfolioCard() {
  return (
    <div className="glass-card" style={{ padding: "2.5rem", textAlign: "center" }}>
      <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
        No holdings yet
      </p>
      <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
        Add some assets to see your portfolio&apos;s allocation, risk, and projections here.
      </p>
    </div>
  );
}
