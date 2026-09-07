"use client";

import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useGoalSuccessProbability, isSuccessProbabilityError, type Goal } from "@/hooks/useGoals";

const TYPE_ICON: Record<Goal["type"], string> = {
  HOUSE: "🏠",
  MARRIAGE: "💍",
  VACATION: "🏖️",
  EDUCATION: "🎓",
  EMERGENCY_FUND: "🛟",
  RETIREMENT: "🌅",
  CAR: "🚗",
  CUSTOM: "🎯",
};

function money(n: number, currencyCode: string): string {
  return `${currencyCode} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function GoalCard({ goal, onDelete }: { goal: Goal; onDelete: (id: string) => void }) {
  const { data: probability } = useGoalSuccessProbability(goal.id);
  const pct = Math.min(100, Math.max(0, goal.percentComplete));
  const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        padding: 20,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border-glass)",
        background: "var(--color-bg-card)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.5rem" }}>{TYPE_ICON[goal.type] ?? "🎯"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-text-primary)" }}>{goal.name}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              {daysLeft >= 0 ? `${daysLeft} days left` : "Past target date"} · {new Date(goal.targetDate).toLocaleDateString()}
            </div>
          </div>
        </div>
        <button
          onClick={() => onDelete(goal.id)}
          aria-label="Delete goal"
          style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", padding: 4 }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: 6 }}>
          <span style={{ color: "var(--color-text-secondary)" }}>{money(goal.currentProgress, goal.currencyCode)}</span>
          <span style={{ color: "var(--color-text-muted)" }}>of {money(goal.targetAmount, goal.currencyCode)}</span>
        </div>
        <div style={{ height: 8, borderRadius: "var(--radius-full)", background: "var(--color-bg-input)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: "var(--radius-full)",
              background: pct >= 100 ? "#00D97E" : "linear-gradient(90deg, var(--color-accent), #00D97E)",
            }}
          />
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 4 }}>{pct.toFixed(1)}% complete</div>
      </div>

      {probability && !isSuccessProbabilityError(probability) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-bg-input)" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            {probability.alreadyAchieved ? "Target already reached" : "Success probability"}
          </span>
          <span style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-accent)" }}>
            {probability.alreadyAchieved ? "🎉" : `${(probability.probabilityOfTarget * 100).toFixed(0)}%`}
          </span>
        </div>
      )}
      {probability && isSuccessProbabilityError(probability) && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>{probability.reason}</div>
      )}
    </motion.div>
  );
}
