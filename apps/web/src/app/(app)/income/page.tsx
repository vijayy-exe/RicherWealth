"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { Modal } from "@/components/ui/Modal";
import { IncomeForm } from "@/components/forms/IncomeForm";
import { useIncomeList, useMonthlyPassiveIncome, useCreateIncome, useDeleteIncome, type IncomeRow } from "@/hooks/useIncome";

const SOURCE_META: Record<string, { label: string; icon: string; color: string }> = {
  SALARY: { label: "Salary", icon: "💼", color: "#3D83FF" },
  BUSINESS: { label: "Business", icon: "🏢", color: "#00D97E" },
  RENTAL: { label: "Rental", icon: "🏠", color: "#9B59B6" },
  DIVIDENDS: { label: "Dividends", icon: "📈", color: "#00D97E" },
  ROYALTIES: { label: "Royalties", icon: "📚", color: "#F5A623" },
  FREELANCE: { label: "Freelance", icon: "💻", color: "#3D83FF" },
  INTEREST: { label: "Interest", icon: "🏦", color: "#38BDF8" },
  AFFILIATE: { label: "Affiliate", icon: "🔗", color: "#A78BFA" },
  YOUTUBE: { label: "YouTube", icon: "▶️", color: "#FF4D6D" },
  OTHER: { label: "Other", icon: "📋", color: "#5C6880" },
};

const FREQUENCY_LABEL: Record<string, string> = {
  WEEKLY: "weekly", BIWEEKLY: "bi-weekly", MONTHLY: "monthly",
  QUARTERLY: "quarterly", ANNUALLY: "annually", ONE_TIME: "one-time",
};

function formatCurrency(value: number, currency: string): string {
  const abs = Math.abs(value);
  if (currency === "INR") {
    if (abs >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${sym}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function IncomePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: incomes = [], isLoading } = useIncomeList();
  const { data: passiveIncome } = useMonthlyPassiveIncome();
  const createIncome = useCreateIncome();
  const deleteIncome = useDeleteIncome();

  const handleDelete = (id: string) => {
    if (confirm("Delete this income source?")) deleteIncome.mutate(id);
  };

  const handleSave = async (data: {
    sourceType: string; name: string; amount: number; frequency: string; currencyCode: string;
    startDate?: string | undefined; endDate?: string | undefined; notes?: string | undefined;
  }) => {
    await createIncome.mutateAsync({
      sourceType: data.sourceType as IncomeRow["sourceType"],
      name: data.name,
      amount: String(data.amount),
      frequency: data.frequency as IncomeRow["frequency"],
      currencyCode: data.currencyCode,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      isActive: true,
      notes: data.notes ?? null,
      details: {},
    });
    setModalOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Income
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            Salary, business, rental, and other recurring income sources
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            padding: "0.75rem 1.5rem",
            background: "var(--color-gain)",
            border: "none", borderRadius: "var(--radius-md)",
            color: "#fff", fontWeight: 700, fontSize: "0.9375rem",
            cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >
          + Add Income
        </button>
      </div>

      {incomes.length > 0 && passiveIncome && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card" style={{ padding: "1.5rem" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 }}>
            Monthly Passive Income
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "2rem", color: "var(--color-gain)" }}>
            {formatCurrency(passiveIncome.monthlyAmount, passiveIncome.currency)}
          </p>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: 4 }}>
            Sum of all active recurring income, monthlyized (one-time entries excluded)
          </p>
        </motion.div>
      )}

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>Loading…</div>
      ) : incomes.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>💵</div>
          <h3 style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "1.25rem", marginBottom: 8 }}>
            No income sources yet
          </h3>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>
            Add your salary, rental income, or side hustle to see your monthly passive income figure.
          </p>
          <button onClick={() => setModalOpen(true)} style={{
            padding: "0.75rem 2rem", background: "var(--color-gain)",
            border: "none", borderRadius: "var(--radius-md)", color: "#fff",
            fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}>
            + Add Income
          </button>
        </motion.div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {incomes.map((income, i) => {
            const meta = SOURCE_META[income.sourceType] ?? { label: income.sourceType, icon: "📋", color: "#5C6880" };
            return (
              <motion.div
                key={income.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass-card"
                style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: "1.5rem" }}>{meta.icon}</span>
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{income.name}</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                      {" · "}{FREQUENCY_LABEL[income.frequency] ?? income.frequency}
                      {!income.isActive && <span style={{ color: "var(--color-loss)" }}> · Inactive</span>}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-gain)" }}>
                    {formatCurrency(parseFloat(income.amount), income.currencyCode)}
                  </span>
                  <button
                    onClick={() => handleDelete(income.id)}
                    style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1rem" }}
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Income" width={600}>
        <IncomeForm onSuccess={(data) => { void handleSave(data); }} isLoading={createIncome.isPending} />
      </Modal>
    </div>
  );
}
