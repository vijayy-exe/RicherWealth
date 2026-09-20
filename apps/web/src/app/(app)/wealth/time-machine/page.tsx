"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useDashboard } from "@/hooks/useDashboard";
import { useWealthTimeline, usePastState, useProjectForward } from "@/hooks/useWealth";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { MonteCarloFanChart, MonteCarloLoadingState, MonteCarloEmptyState } from "@/components/analytics/MonteCarloFanChart";
import { formatCurrency } from "@/lib/format";

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-input)", color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)", borderRadius: 8,
  padding: "0.5rem 0.75rem", fontSize: "0.8125rem",
};

function defaultPastDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export default function TimeMachinePage() {
  const dashboard = useDashboard();
  const timeline = useWealthTimeline();
  const [selectedDate, setSelectedDate] = useState(defaultPastDate());
  const [committedDate, setCommittedDate] = useState<string | null>(defaultPastDate());
  const pastState = usePastState(committedDate);

  const [horizonYears, setHorizonYears] = useState(10);
  const projection = useProjectForward(horizonYears, 0);

  const currency = dashboard.data?.baseCurrency ?? "INR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
          Financial Time Machine
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
          Exact net-worth history, an approximate past allocation reconstruction, and a forward projection from today.
        </p>
      </motion.div>

      {timeline.isLoading ? (
        <div className="glass-card" style={{ padding: "1.5rem", minHeight: 220 }} />
      ) : timeline.data && timeline.data.length > 1 ? (
        <TrendChart data={timeline.data} currency={currency} />
      ) : (
        <div className="glass-card" style={{ padding: "1.5rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>Not enough history yet for a trend.</p>
        </div>
      )}

      <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Look Back
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <input type="date" style={inputStyle} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
          <button
            onClick={() => setCommittedDate(selectedDate)}
            style={{
              padding: "0.5rem 1rem", borderRadius: "var(--radius-md)",
              background: "var(--color-accent-muted)", border: "1px solid var(--color-accent-glow)",
              color: "var(--color-accent)", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer",
            }}
          >
            View This Date
          </button>
        </div>

        {pastState.isLoading ? (
          <div style={{ height: 80 }} />
        ) : pastState.isError ? (
          <p style={{ fontSize: "0.8125rem", color: "#FF4D6D" }}>{(pastState.error as Error).message}</p>
        ) : pastState.data && "insufficientData" in pastState.data ? (
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>{pastState.data.reason}</p>
        ) : pastState.data ? (
          (() => {
            const past = pastState.data;
            return (
              <>
                <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
                      Net Worth on {past.snapshotDate}
                    </div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
                      {formatCurrency(past.netWorth, past.baseCurrency)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Total Assets</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
                      {formatCurrency(past.totalAssets, past.baseCurrency)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" }}>Total Liabilities</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
                      {formatCurrency(past.totalLiabilities, past.baseCurrency)}
                    </div>
                  </div>
                </div>

                {past.approximateAllocation.length > 0 && (
                  <div>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>
                      Approximate allocation as of this date (walked back to each asset&apos;s nearest prior revaluation, or its current value where none exists):
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {past.approximateAllocation.map((a) => (
                        <div key={a.category} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                          <span style={{ color: "var(--color-text-secondary)" }}>{a.category}</span>
                          <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                            {formatCurrency(a.valueInBase, past.baseCurrency)} ({a.percentage.toFixed(1)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()
        ) : null}
      </div>

      {projection.isLoading ? (
        <MonteCarloLoadingState />
      ) : projection.isError ? (
        <MonteCarloEmptyState reason={(projection.error as Error).message} />
      ) : projection.data ? (
        <MonteCarloFanChart
          result={{ ...projection.data.projection, cached: false }}
          years={horizonYears}
          onYearsChange={setHorizonYears}
          onRefresh={() => projection.refetch()}
          refreshing={projection.isFetching}
          periodUnit="months"
          currency={currency}
        />
      ) : null}
    </div>
  );
}
