"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useSimulateScenario, type SimulateScenarioInput } from "@/hooks/useWealth";
import { useDashboard } from "@/hooks/useDashboard";
import { ScenarioPicker } from "@/components/wealth/ScenarioPicker";
import { ScenarioComparisonChart } from "@/components/wealth/ScenarioComparisonChart";

export default function DigitalTwinPage() {
  const [input, setInput] = useState<SimulateScenarioInput>({ scenarioType: "MARKET_CRASH", horizonYears: 10, monthlyContribution: 0 });
  const simulate = useSimulateScenario();
  const dashboard = useDashboard();
  // Fix Audit B-01 verification step explicitly calls out Digital Twin --
  // ScenarioComparisonChart previously hardcoded ₹ unconditionally, same
  // bug as MonteCarloFanChart.
  const currency = dashboard.data?.baseCurrency ?? "INR";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
          Wealth Digital Twin
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
          Simulate a market crash, job loss, inheritance, and more against your real portfolio — side by side with your baseline projection.
        </p>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1.5rem", alignItems: "start" }}>
        <ScenarioPicker input={input} onChange={setInput} onRun={() => simulate.mutate(input)} running={simulate.isPending} />

        {simulate.isPending ? (
          <div className="glass-card" style={{ padding: "1.5rem", minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>Running simulation...</p>
          </div>
        ) : simulate.isError ? (
          <div className="glass-card" style={{ padding: "1.5rem", borderColor: "rgba(255, 77, 109, 0.3)" }}>
            <p style={{ fontSize: "0.875rem", color: "#FF4D6D", fontWeight: 600 }}>Simulation failed</p>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>{(simulate.error as Error).message}</p>
          </div>
        ) : simulate.data ? (
          <ScenarioComparisonChart result={simulate.data} currency={currency} />
        ) : (
          <div className="glass-card" style={{ padding: "2.5rem", textAlign: "center" }}>
            <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.5rem" }}>
              Pick a scenario and run a simulation
            </p>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
              We&apos;ll project your real current net worth forward with and without the scenario applied.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
