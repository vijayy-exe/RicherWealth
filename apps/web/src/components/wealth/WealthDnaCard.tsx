"use client";

import { motion } from "framer-motion";
import { Dna, RefreshCw } from "lucide-react";
import type { WealthDnaProfileResult, WealthDnaInsufficientData } from "@/hooks/useWealth";
import { useRefreshWealthDna } from "@/hooks/useWealth";

const ARCHETYPE_COLOR: Record<string, string> = {
  "Growth Builder": "#00D97E",
  "Income Generator": "#3D83FF",
  "Balanced Optimizer": "#FFB547",
  "Capital Preserver": "#8891A8",
  "Debt-Focused Rebuilder": "#FF4D6D",
};

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function WealthDnaCard({ profile }: { profile: WealthDnaProfileResult | WealthDnaInsufficientData }) {
  const refresh = useRefreshWealthDna();

  if ("insufficientData" in profile) {
    return (
      <div className="glass-card" style={{ padding: "2rem", textAlign: "center" }}>
        <Dna size={28} color="var(--color-text-muted)" style={{ marginBottom: 12 }} />
        <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
          Not enough data for a Wealth DNA read yet
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>{profile.reason}</p>
      </div>
    );
  }

  const color = ARCHETYPE_COLOR[profile.archetype] ?? "var(--color-accent)";
  const { signals } = profile;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="glass-card" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Dna size={22} color={color} />
          </div>
          <div>
            <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
              Wealth DNA
            </h3>
            <span style={{ fontSize: "1.25rem", fontWeight: 800, color }}>{profile.archetype}</span>
          </div>
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          title="Recompute archetype"
          style={{
            display: "flex", alignItems: "center", gap: "0.375rem",
            padding: "0.375rem 0.625rem", borderRadius: 8, fontSize: "0.75rem", fontWeight: 600,
            border: "1px solid var(--color-border-glass)", cursor: refresh.isPending ? "default" : "pointer",
            background: "transparent", color: "var(--color-text-secondary)", opacity: refresh.isPending ? 0.6 : 1, flexShrink: 0,
          }}
        >
          <RefreshCw size={13} className={refresh.isPending ? "spin" : ""} />
        </button>
      </div>

      <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "1rem" }}>{profile.narrative}</p>
      {!profile.isLLMGenerated && (
        <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginBottom: "1rem" }}>
          Computed description (AI narration unavailable)
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingTop: "1rem", borderTop: "1px solid var(--color-border-glass)" }}>
        {signals.overallRiskScore !== null && <SignalRow label="Overall risk score" value={`${signals.overallRiskScore.toFixed(0)}/100`} />}
        {signals.debtRiskScore !== null && <SignalRow label="Debt risk score" value={`${signals.debtRiskScore.toFixed(0)}/100`} />}
        {signals.savingsRatePct !== null && <SignalRow label="Savings rate" value={`${signals.savingsRatePct.toFixed(0)}%`} />}
        {signals.passiveIncomeSharePct !== null && <SignalRow label="Passive income share" value={`${signals.passiveIncomeSharePct.toFixed(0)}%`} />}
        {signals.avgGoalAggressiveness !== null && <SignalRow label="Goal aggressiveness" value={`${(signals.avgGoalAggressiveness * 100).toFixed(0)}% of income`} />}
      </div>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </motion.div>
  );
}
