"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateGoal, type GoalType } from "@/hooks/useGoals";
import { useDashboard } from "@/hooks/useDashboard";

const GOAL_TYPES: { value: GoalType; label: string; icon: string }[] = [
  { value: "HOUSE", label: "House", icon: "🏠" },
  { value: "MARRIAGE", label: "Marriage", icon: "💍" },
  { value: "VACATION", label: "Vacation", icon: "🏖️" },
  { value: "EDUCATION", label: "Education", icon: "🎓" },
  { value: "EMERGENCY_FUND", label: "Emergency Fund", icon: "🛟" },
  { value: "RETIREMENT", label: "Retirement", icon: "🌅" },
  { value: "CAR", label: "Car", icon: "🚗" },
  { value: "CUSTOM", label: "Custom", icon: "🎯" },
];

function defaultTargetDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d.toISOString().slice(0, 10);
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  borderRadius: 10,
  background: "var(--color-bg-input)",
  border: "1px solid var(--color-border-glass)",
  color: "var(--color-text-primary)",
  fontSize: "0.9375rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: "0.375rem",
  display: "block",
};

export function CreateGoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dashboard = useDashboard();
  const createGoal = useCreateGoal();
  const [name, setName] = useState("");
  const [type, setType] = useState<GoalType>("CUSTOM");
  const [targetAmount, setTargetAmount] = useState(500000);
  const [targetDate, setTargetDate] = useState(defaultTargetDate());
  const [standaloneProgressAmount, setStandaloneProgressAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const currencyCode = dashboard.data?.baseCurrency ?? "USD";

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Give your goal a name.");
      return;
    }
    try {
      await createGoal.mutateAsync({
        type,
        name: name.trim(),
        targetAmount,
        targetDate,
        currencyCode,
        standaloneProgressAmount,
      });
      setName("");
      setTargetAmount(500000);
      setStandaloneProgressAmount(0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Goal" width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={labelStyle}>Goal Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Down payment on a house" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Goal Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as GoalType)} style={inputStyle}>
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Target Amount ({currencyCode})</label>
            <input
              type="number"
              value={Number.isFinite(targetAmount) ? targetAmount : ""}
              onChange={(e) => setTargetAmount(e.target.value === "" ? 0 : Number(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Target Date</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Already saved toward this goal ({currencyCode})</label>
          <input
            type="number"
            value={Number.isFinite(standaloneProgressAmount) ? standaloneProgressAmount : ""}
            onChange={(e) => setStandaloneProgressAmount(e.target.value === "" ? 0 : Number(e.target.value))}
            style={inputStyle}
          />
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 4 }}>
            Optional — a standalone figure not tied to a specific holding.
          </p>
        </div>

        {error && <p style={{ fontSize: "0.8125rem", color: "#FF4D6D" }}>{error}</p>}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: "0.625rem", borderRadius: 10, fontSize: "0.875rem", fontWeight: 600, border: "1px solid var(--color-border-glass)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={createGoal.isPending}
            style={{ flex: 1, padding: "0.625rem", borderRadius: 10, fontSize: "0.875rem", fontWeight: 700, border: "none", background: "var(--color-accent)", color: "#fff", cursor: "pointer", opacity: createGoal.isPending ? 0.6 : 1 }}
          >
            {createGoal.isPending ? "Saving…" : "Create Goal"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
