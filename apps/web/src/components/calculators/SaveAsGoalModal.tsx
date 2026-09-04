"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateGoal, type GoalType } from "@/hooks/useGoals";
import { useDashboard } from "@/hooks/useDashboard";
import type { GoalMapping } from "@/lib/calculators/types";
import { formatCurrency } from "@/lib/calculators/format";

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: "HOUSE", label: "House" },
  { value: "MARRIAGE", label: "Marriage" },
  { value: "VACATION", label: "Vacation" },
  { value: "EDUCATION", label: "Education" },
  { value: "EMERGENCY_FUND", label: "Emergency Fund" },
  { value: "RETIREMENT", label: "Retirement" },
  { value: "CAR", label: "Car" },
  { value: "CUSTOM", label: "Custom" },
];

function yearsFromNowToDate(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + Math.floor(years));
  d.setMonth(d.getMonth() + Math.round((years % 1) * 12));
  return d.toISOString().slice(0, 10);
}

export function SaveAsGoalButton({ mapping }: { mapping: GoalMapping }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.625rem 1.25rem",
          borderRadius: 10, fontSize: "0.875rem", fontWeight: 700, border: "none", cursor: "pointer",
          background: "var(--color-accent)", color: "#fff",
        }}
      >
        🎯 Save as Goal
      </button>
      <AnimatePresence>{open && <SaveAsGoalModal mapping={mapping} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function SaveAsGoalModal({ mapping, onClose }: { mapping: GoalMapping; onClose: () => void }) {
  const dashboard = useDashboard();
  const createGoal = useCreateGoal();
  const [name, setName] = useState(mapping.suggestedName);
  const [type, setType] = useState<GoalType>("CUSTOM");
  const [saved, setSaved] = useState(false);

  const currencyCode = dashboard.data?.baseCurrency ?? "INR";
  const targetDate = yearsFromNowToDate(mapping.yearsFromNow);

  async function handleSave() {
    await createGoal.mutateAsync({
      type, name, targetAmount: mapping.targetAmount, targetDate, currencyCode,
    });
    setSaved(true);
    setTimeout(onClose, 1200);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card"
        style={{ padding: "1.75rem", width: "100%", maxWidth: 420 }}
      >
        {saved ? (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <p style={{ fontSize: "2rem" }}>✅</p>
            <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)" }}>Goal saved!</p>
          </div>
        ) : (
          <>
            <h3 style={{ fontSize: "1.0625rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "1.25rem" }}>
              Save as Goal
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "0.375rem", display: "block" }}>Goal Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: "100%", padding: "0.625rem 0.875rem", borderRadius: 10, background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", color: "var(--color-text-primary)", fontSize: "0.9375rem" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "0.375rem", display: "block" }}>Goal Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as GoalType)}
                  style={{ width: "100%", padding: "0.625rem 0.875rem", borderRadius: 10, background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", color: "var(--color-text-primary)", fontSize: "0.9375rem" }}
                >
                  {GOAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1rem", borderRadius: 10, background: "var(--color-bg-input)" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Target</span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{formatCurrency(mapping.targetAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.875rem 1rem", borderRadius: 10, background: "var(--color-bg-input)" }}>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>By</span>
                <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)" }}>{targetDate}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: "0.625rem", borderRadius: 10, fontSize: "0.875rem", fontWeight: 600, border: "1px solid var(--color-border-glass)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createGoal.isPending || !name.trim()}
                style={{ flex: 1, padding: "0.625rem", borderRadius: 10, fontSize: "0.875rem", fontWeight: 700, border: "none", background: "var(--color-accent)", color: "#fff", cursor: "pointer", opacity: createGoal.isPending ? 0.6 : 1 }}
              >
                {createGoal.isPending ? "Saving..." : "Save Goal"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
