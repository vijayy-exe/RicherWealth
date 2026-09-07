"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useGoals, useDeleteGoal } from "@/hooks/useGoals";
import { GoalCard } from "@/components/goals/GoalCard";
import { CreateGoalModal } from "@/components/goals/CreateGoalModal";

export default function GoalsPage() {
  const { data: goals, isLoading, isError } = useGoals();
  const deleteGoal = useDeleteGoal();
  const [createOpen, setCreateOpen] = useState(false);

  function handleDelete(id: string) {
    deleteGoal.mutate(id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>Goals</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            Track progress toward what you're saving for — with a real, simulation-based success probability.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "0.75rem 1.5rem",
            background: "var(--color-accent)",
            border: "none", borderRadius: "var(--radius-md)",
            color: "#fff", fontWeight: 700, fontSize: "0.9375rem",
            cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >
          + Add Goal
        </button>
      </div>

      {isLoading && <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Loading goals…</p>}
      {isError && <p style={{ color: "#FF4D6D", fontSize: "0.875rem" }}>Could not load goals. Try refreshing.</p>}

      {goals && goals.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: 48,
            textAlign: "center",
            borderRadius: "var(--radius-lg)",
            border: "1px dashed var(--color-border-glass)",
            background: "var(--color-bg-card)",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🎯</div>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>No goals yet</h2>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginBottom: 20 }}>
            Add a goal directly, or use any calculator's &quot;Save as Goal&quot; button to turn a projection into one.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              padding: "0.625rem 1.25rem",
              background: "var(--color-accent-muted)",
              border: "1px solid var(--color-accent-glow)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-accent)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            + Add Your First Goal
          </button>
        </motion.div>
      )}

      {goals && goals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <CreateGoalModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
