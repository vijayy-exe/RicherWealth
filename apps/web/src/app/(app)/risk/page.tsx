"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRiskProfile, useRiskTrend, useRefreshRiskProfile } from "@/hooks/useRisk";
import { RiskRadarChart, RiskRadarEmptyState } from "@/components/risk/RiskRadarChart";
import { RiskSubScoreList } from "@/components/risk/RiskSubScoreList";
import { RiskTrendChart, RiskTrendEmptyState } from "@/components/risk/RiskTrendChart";

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

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem", borderColor: "rgba(255, 77, 109, 0.3)" }}>
      <p style={{ fontSize: "0.875rem", color: "#FF4D6D", fontWeight: 600 }}>Couldn&apos;t load this section</p>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{message}</p>
    </div>
  );
}

export default function RiskPage() {
  const profile = useRiskProfile();
  const trend = useRiskTrend();
  const refreshProfile = useRefreshRiskProfile();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh = await refreshProfile();
      queryClient.setQueryData(["risk", "profile"], fresh);
      await queryClient.invalidateQueries({ queryKey: ["risk", "trend"] });
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
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
            Risk Profile
          </h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
            Seven risk dimensions across liquidity, debt, markets, and macro conditions — computed transparently, never a black box.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || profile.isLoading}
          style={{
            display: "flex", alignItems: "center", gap: "0.375rem",
            padding: "0.5rem 0.875rem", borderRadius: 8, fontSize: "0.8125rem", fontWeight: 600,
            border: "1px solid var(--color-border-glass)", cursor: refreshing ? "default" : "pointer",
            background: "transparent", color: "var(--color-text-secondary)", opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
          {refreshing ? "Recomputing..." : "Recompute"}
        </button>
      </motion.div>

      {profile.isLoading ? (
        <CardSkeleton height={420} />
      ) : profile.isError ? (
        <ErrorCard message={(profile.error as Error).message} />
      ) : profile.data && profile.data.overallScore !== null ? (
        <RiskRadarChart subScores={profile.data.subScores} overallScore={profile.data.overallScore} />
      ) : (
        <RiskRadarEmptyState />
      )}

      {profile.isLoading ? (
        <CardSkeleton height={320} />
      ) : profile.isError ? null : profile.data ? (
        <RiskSubScoreList subScores={profile.data.subScores} />
      ) : null}

      {trend.isLoading ? (
        <CardSkeleton height={220} />
      ) : trend.isError ? (
        <ErrorCard message={(trend.error as Error).message} />
      ) : trend.data && trend.data.length > 1 ? (
        <RiskTrendChart data={trend.data} />
      ) : (
        <RiskTrendEmptyState />
      )}

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
