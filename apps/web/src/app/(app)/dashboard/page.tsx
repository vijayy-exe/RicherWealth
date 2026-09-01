"use client";

import { motion } from "framer-motion";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

import { useDashboard } from "@/hooks/useDashboard";
import { useNetWorthSocket } from "@/hooks/useNetWorthSocket";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { AllocationChart } from "@/components/dashboard/AllocationChart";
import { CurrencyExposureWidget } from "@/components/dashboard/CurrencyExposureWidget";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Spinner } from "@richer/ui";

// Skeleton loader for cards
function CardSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div
      className={`glass-card ${wide ? "col-span-2" : ""}`}
      style={{ padding: "1.5rem", minHeight: 120 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ height: 10, width: "40%", background: "var(--color-bg-input)", borderRadius: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ height: 28, width: "70%", background: "var(--color-bg-input)", borderRadius: 8, animation: "pulse 1.5s ease-in-out 0.1s infinite" }} />
        <div style={{ height: 10, width: "50%", background: "var(--color-bg-input)", borderRadius: 6, animation: "pulse 1.5s ease-in-out 0.2s infinite" }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  // WebSocket for live updates (stub — connects but nothing pushed until real price feeds)
  useNetWorthSocket();

  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
            Dashboard
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            Your complete financial picture at a glance
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Live indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isError ? "var(--color-loss)" : "var(--color-gain)",
              boxShadow: isError ? "0 0 6px var(--color-loss)" : "0 0 6px var(--color-gain)",
              animation: isError ? "none" : "pulse 2s ease-in-out infinite",
            }} />
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              {isError ? "Offline" : "Live"}
            </span>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem",
              padding: "0.5rem 0.875rem",
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-glass)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-text-secondary)",
              fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer",
            }}
          >
            <RefreshCw size={14} style={{ animation: isFetching ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Error state */}
      {isError && !isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            padding: "1.25rem 1.5rem",
            background: "var(--color-loss-muted)",
            border: "1px solid rgba(255,77,109,0.2)",
            borderRadius: "var(--radius-lg)",
            color: "var(--color-loss)",
            fontSize: "0.875rem",
          }}
        >
          ⚠️ Could not connect to the API — make sure the backend is running.{" "}
          {error?.message && <code style={{ opacity: 0.8 }}>{error.message}</code>}
        </motion.div>
      )}

      {/* Loading: card skeletons */}
      {isLoading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
            <CardSkeleton wide />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </>
      )}

      {/* Empty state */}
      {!isLoading && data && !data.hasAssets && (
        <div style={{ paddingTop: "3rem" }}>
          <EmptyState />
        </div>
      )}

      {/* Full dashboard */}
      {!isLoading && data && data.hasAssets && (
        <>
          {/* Summary cards — 2-column top row + 3-column bottom row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
            <SummaryCard
              label="Total Net Worth"
              value={data.totalNetWorth}
              changeAbs={data.todayChangeAbs}
              changePct={data.todayChangePct}
              currency={data.baseCurrency}
              isPrimary
              delay={0}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
            <SummaryCard
              label="Today's Change"
              value={data.todayChangeAbs}
              changePct={data.todayChangePct}
              currency={data.baseCurrency}
              delay={0.1}
            />
            <SummaryCard
              label="30-Day Growth"
              value={data.monthChangeAbs}
              changePct={data.monthChangePct}
              currency={data.baseCurrency}
              delay={0.15}
            />
            <SummaryCard
              label="Annual Growth"
              value={data.yearChangeAbs}
              changePct={data.yearChangePct}
              currency={data.baseCurrency}
              delay={0.2}
            />
          </div>

          {/* Quick stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="glass-card"
              style={{ padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}
            >
              <div style={{ fontSize: "2rem" }}>🛡️</div>
              <div>
                <p style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>Emergency Fund</p>
                <p style={{ fontSize: "1.25rem", fontWeight: 700, color: data.emergencyFundHealth >= 6 ? "var(--color-gain)" : data.emergencyFundHealth >= 3 ? "#FFB547" : "var(--color-loss)" }}>
                  {data.emergencyFundHealth.toFixed(1)} months
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  {data.emergencyFundHealth >= 6 ? "Healthy ✓" : data.emergencyFundHealth >= 3 ? "Adequate" : "Build this up"}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card"
              style={{ padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}
            >
              <div style={{ fontSize: "2rem" }}>⚖️</div>
              <div>
                <p style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 4 }}>Debt Ratio</p>
                <p style={{ fontSize: "1.25rem", fontWeight: 700, color: data.debtRatio <= 0.3 ? "var(--color-gain)" : data.debtRatio <= 0.5 ? "#FFB547" : "var(--color-loss)" }}>
                  {(data.debtRatio * 100).toFixed(1)}%
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                  {data.debtRatio <= 0.3 ? "Low — well managed" : data.debtRatio <= 0.5 ? "Moderate" : "High — review loans"}
                </p>
              </div>
            </motion.div>
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: "1rem" }}>
            {data.assetAllocation.length > 0 && (
              <AllocationChart data={data.assetAllocation} currency={data.baseCurrency} />
            )}
            {data.snapshots.length > 1 && (
              <TrendChart data={data.snapshots} currency={data.baseCurrency} />
            )}
          </div>

          {data.currencyExposure.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
              <CurrencyExposureWidget data={data.currencyExposure} baseCurrency={data.baseCurrency} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
