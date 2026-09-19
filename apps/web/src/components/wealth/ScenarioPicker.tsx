"use client";

import type { ScenarioType, SimulateScenarioInput } from "@/hooks/useWealth";

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  MARKET_CRASH: "Market Crash",
  JOB_LOSS: "Job Loss",
  INHERITANCE: "Inheritance",
  HOME_PURCHASE: "Home Purchase",
  EARLY_RETIREMENT: "Early Retirement",
  INFLATION_SPIKE: "Inflation Spike",
  CURRENCY_DEPRECIATION: "Currency Depreciation",
  SALARY_CHANGE: "Salary Change",
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-input)", color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)", borderRadius: 8,
  padding: "0.5rem 0.75rem", fontSize: "0.8125rem", width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "0.375rem", display: "block",
};

function NumberField({ label, value, onChange, placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        style={inputStyle}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </div>
  );
}

export function ScenarioPicker({
  input,
  onChange,
  onRun,
  running,
}: {
  input: SimulateScenarioInput;
  onChange: (input: SimulateScenarioInput) => void;
  onRun: () => void;
  running: boolean;
}) {
  function set<K extends keyof SimulateScenarioInput>(key: K, value: SimulateScenarioInput[K]) {
    onChange({ ...input, [key]: value });
  }

  return (
    <div className="glass-card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        Scenario Setup
      </h3>

      <div>
        <label style={labelStyle}>Scenario Type</label>
        <select style={inputStyle} value={input.scenarioType} onChange={(e) => set("scenarioType", e.target.value as ScenarioType)}>
          {(Object.keys(SCENARIO_LABELS) as ScenarioType[]).map((t) => (
            <option key={t} value={t}>{SCENARIO_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <NumberField label="Horizon (years)" value={input.horizonYears} onChange={(v) => set("horizonYears", v)} placeholder="10" />
        <NumberField label="Monthly contribution" value={input.monthlyContribution} onChange={(v) => set("monthlyContribution", v)} placeholder="0" />
      </div>

      {input.scenarioType === "MARKET_CRASH" && (
        <NumberField label="Crash size (%)" value={input.marketCrashPct} onChange={(v) => set("marketCrashPct", v)} placeholder="30" />
      )}

      {input.scenarioType === "JOB_LOSS" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <NumberField label="Job loss (months)" value={input.jobLossMonths} onChange={(v) => set("jobLossMonths", v)} placeholder="6" />
          <NumberField label="Monthly drawdown" value={input.jobLossMonthlyDrawdown} onChange={(v) => set("jobLossMonthlyDrawdown", v)} placeholder="= contribution" />
        </div>
      )}

      {input.scenarioType === "INHERITANCE" && (
        <NumberField label="Inheritance amount" value={input.inheritanceAmount} onChange={(v) => set("inheritanceAmount", v)} placeholder="0" />
      )}

      {input.scenarioType === "HOME_PURCHASE" && (
        <NumberField label="Down payment" value={input.homePurchaseDownPayment} onChange={(v) => set("homePurchaseDownPayment", v)} placeholder="0" />
      )}

      {input.scenarioType === "EARLY_RETIREMENT" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <NumberField label="Retire at (month)" value={input.retirementStartMonth} onChange={(v) => set("retirementStartMonth", v)} placeholder="half horizon" />
          <NumberField label="Monthly withdrawal" value={input.retirementMonthlyWithdrawal} onChange={(v) => set("retirementMonthlyWithdrawal", v)} placeholder="= contribution" />
        </div>
      )}

      {input.scenarioType === "INFLATION_SPIKE" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <NumberField label="Spike size (pts)" value={input.inflationSpikePct} onChange={(v) => set("inflationSpikePct", v)} placeholder="3" />
          <NumberField label="Spike (months)" value={input.inflationSpikeMonths} onChange={(v) => set("inflationSpikeMonths", v)} placeholder="12" />
        </div>
      )}

      {input.scenarioType === "CURRENCY_DEPRECIATION" && (
        <NumberField label="Depreciation (%)" value={input.currencyDepreciationPct} onChange={(v) => set("currencyDepreciationPct", v)} placeholder="15" />
      )}

      {input.scenarioType === "SALARY_CHANGE" && (
        <NumberField label="Salary change (%, signed)" value={input.salaryChangePct} onChange={(v) => set("salaryChangePct", v)} placeholder="20" />
      )}

      <button
        onClick={onRun}
        disabled={running}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "0.625rem 1rem", borderRadius: "var(--radius-md)",
          background: "var(--color-accent-muted)", border: "1px solid var(--color-accent-glow)",
          color: "var(--color-accent)", fontWeight: 600, fontSize: "0.8125rem",
          cursor: running ? "default" : "pointer", opacity: running ? 0.7 : 1,
        }}
      >
        {running ? "Simulating..." : "Run Simulation"}
      </button>
    </div>
  );
}
