"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AgGridReact } from "ag-grid-react";
import { ClientSideRowModelModule, type ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { Modal } from "@/components/ui/Modal";
import { LiabilityForm } from "@/components/forms/LiabilityForm";
import { useLiabilities, useLiabilitiesSummary, useCreateLiability, useDeleteLiability, type LiabilityRow, type LiabilitiesPortfolioSummary } from "@/hooks/useLiabilities";
import { ExportButton } from "@/components/ExportButton";

const LIABILITY_META: Record<string, { label: string; icon: string; color: string }> = {
  MORTGAGE: { label: "Mortgage", icon: "🏠", color: "#9B59B6" },
  CAR_LOAN: { label: "Car Loan", icon: "🚗", color: "#3D83FF" },
  EDUCATION_LOAN: { label: "Education Loan", icon: "🎓", color: "#00D97E" },
  PERSONAL_LOAN: { label: "Personal Loan", icon: "💳", color: "#F5A623" },
  CREDIT_CARD: { label: "Credit Card", icon: "💳", color: "#E74C3C" },
  OTHER: { label: "Other", icon: "📋", color: "#5C6880" },
};

// ─── Column definitions ───────────────────────────────────────────────────────
const columnDefs: ColDef<LiabilityRow>[] = [
  {
    field: "name",
    headerName: "Liability Name",
    flex: 2,
    minWidth: 200,
    cellRenderer: (params: { data: LiabilityRow }) => {
      const meta = LIABILITY_META[params.data.type] ?? { icon: "📋", color: "#5C6880" };
      return (
        <Link
          href={`/liabilities/${params.data.id}`}
          style={{ display: "flex", alignItems: "center", gap: 10, height: "100%", textDecoration: "none" }}
        >
          <span style={{ fontSize: "1.1rem" }}>{meta.icon}</span>
          <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{params.data.name}</span>
        </Link>
      );
    },
  },
  {
    field: "type",
    headerName: "Type",
    width: 160,
    cellRenderer: (params: { data: LiabilityRow }) => {
      const meta = LIABILITY_META[params.data.type] ?? { label: params.data.type, color: "#5C6880" };
      return (
        <span style={{
          padding: "2px 10px", borderRadius: 20,
          background: meta.color + "20", color: meta.color,
          fontSize: "0.75rem", fontWeight: 700,
        }}>
          {meta.label}
        </span>
      );
    },
  },
  {
    field: "remainingBalance",
    headerName: "Outstanding",
    flex: 1,
    minWidth: 140,
    cellRenderer: (params: { data: LiabilityRow }) => {
      const val = parseFloat(params.data.remainingBalance);
      return (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-loss)", fontSize: "0.9rem" }}>
          ₹{val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </span>
      );
    },
    comparator: (a: string, b: string) => parseFloat(b) - parseFloat(a),
    sort: "desc" as const,
  },
  {
    field: "interestRate",
    headerName: "Interest Rate",
    width: 130,
    cellRenderer: (params: { data: LiabilityRow }) => (
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-warning)", fontSize: "0.875rem" }}>
        {parseFloat(params.data.interestRate).toFixed(2)}% p.a.
      </span>
    ),
    comparator: (a: string, b: string) => parseFloat(a) - parseFloat(b),
  },
  {
    field: "emiAmount",
    headerName: "EMI",
    width: 130,
    cellRenderer: (params: { data: LiabilityRow }) =>
      params.data.emiAmount
        ? <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>
            ₹{parseFloat(params.data.emiAmount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        : <span style={{ color: "var(--color-text-muted)" }}>—</span>,
  },
  {
    field: "dueDate",
    headerName: "Next Due",
    width: 150,
    cellRenderer: (params: { data: LiabilityRow }) => {
      if (!params.data.dueDate) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
      const due = new Date(params.data.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      const isOverdue = daysUntilDue < 0;
      const isSoon = daysUntilDue >= 0 && daysUntilDue <= 7;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
            {due.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
          <span style={{
            fontSize: "0.6875rem", fontWeight: 700,
            color: isOverdue ? "var(--color-loss)" : isSoon ? "#FFB547" : "var(--color-text-muted)",
          }}>
            {isOverdue ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? "Due today" : `in ${daysUntilDue}d`}
          </span>
        </div>
      );
    },
  },
  {
    headerName: "",
    width: 60,
    sortable: false,
    filter: false,
    cellRenderer: (params: { data: LiabilityRow; context: { onDelete: (id: string) => void } }) => (
      <button
        onClick={() => params.context.onDelete(params.data.id)}
        style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1rem", padding: "4px" }}
        title="Delete"
      >
        🗑
      </button>
    ),
  },
];

// ─── Summary header ───────────────────────────────────────────────────────────
// Uses the server-computed, currency-converted summary (useLiabilitiesSummary)
// — NOT a client-side sum of raw remainingBalance/emiAmount, which is
// silently wrong (and skews the weighted interest rate) for a user with
// liabilities in more than one currency.
function LiabilitySummary({ summary }: { summary: LiabilitiesPortfolioSummary | null | undefined }) {
  const fmt = (n: number) =>
    summary ? new Intl.NumberFormat(undefined, { style: "currency", currency: summary.currency, maximumFractionDigits: 0 }).format(n) : "—";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {[
        { label: "Total Outstanding", value: fmt(summary?.totalOutstanding ?? 0), color: "var(--color-loss)" },
        { label: "Monthly EMI", value: fmt(summary?.totalMonthlyEmi ?? 0), color: "var(--color-warning)" },
        { label: "Weighted Interest", value: `${(summary?.weightedInterestRate ?? 0).toFixed(2)}% p.a.`, color: "var(--color-text-primary)" },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          padding: "16px 20px",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-glass)",
          borderRadius: "var(--radius-lg)",
        }}>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 6 }}>{label}</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.25rem", color }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LiabilitiesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const { data: liabilities = [], isLoading } = useLiabilities();
  const { data: summary } = useLiabilitiesSummary();
  const createLiability = useCreateLiability();
  const deleteLiability = useDeleteLiability();

  const handleDelete = (id: string) => {
    if (confirm("Delete this liability?")) deleteLiability.mutate(id);
  };

  const gridContext = useMemo(() => ({ onDelete: handleDelete }), []);

  const handleSave = async (data: {
    type: string; name: string; principalAmount: number; remainingBalance: number;
    interestRate: number; currencyCode: string; emiAmount?: number | undefined;
    dueDate?: string | undefined; startDate?: string | undefined; maturityDate?: string | undefined; notes?: string | undefined;
    paymentFrequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUALLY";
    tenureMonths?: number | undefined; minPaymentPercent?: number | undefined; minPaymentFlat?: number | undefined;
  }) => {
    await createLiability.mutateAsync({
      type: data.type,
      name: data.name,
      principalAmount: String(data.principalAmount),
      remainingBalance: String(data.remainingBalance),
      interestRate: String(data.interestRate),
      currencyCode: data.currencyCode,
      emiAmount: data.emiAmount != null ? String(data.emiAmount) : null,
      dueDate: data.dueDate ?? null,
      startDate: data.startDate ?? null,
      maturityDate: data.maturityDate ?? null,
      notes: data.notes ?? null,
      paymentFrequency: data.paymentFrequency,
      tenureMonths: data.tenureMonths ?? null,
      minPaymentPercent: data.minPaymentPercent != null ? String(data.minPaymentPercent) : null,
      minPaymentFlat: data.minPaymentFlat != null ? String(data.minPaymentFlat) : null,
      details: {},
    });
    setModalOpen(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Liabilities
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            Loans, credit cards, and outstanding debt
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ExportButton dataset="liabilities" />
          <button
            onClick={() => setModalOpen(true)}
            style={{
              padding: "0.75rem 1.5rem",
              background: "var(--color-loss)",
              border: "none", borderRadius: "var(--radius-md)",
              color: "#fff", fontWeight: 700, fontSize: "0.9375rem",
              cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
          >
            + Add Liability
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {liabilities.length > 0 && <LiabilitySummary summary={summary} />}

      {/* Grid or empty state */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>Loading…</div>
      ) : liabilities.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center", padding: "80px 24px" }}
        >
          <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>🎉</div>
          <h3 style={{ fontWeight: 700, color: "var(--color-gain)", fontSize: "1.25rem", marginBottom: 8 }}>
            Debt free!
          </h3>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 24 }}>No liabilities recorded yet. Add any outstanding loans or credit cards.</p>
          <button onClick={() => setModalOpen(true)} style={{
            padding: "0.75rem 2rem", background: "var(--color-loss)",
            border: "none", borderRadius: "var(--radius-md)", color: "#fff",
            fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}>
            + Add Liability
          </button>
        </motion.div>
      ) : (
        <div className="ag-theme-quartz-dark" style={{ height: Math.min(600, 56 + liabilities.length * 52), width: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <AgGridReact
            modules={[ClientSideRowModelModule]}
            theme="legacy"
            rowData={liabilities}
            columnDefs={columnDefs}
            rowHeight={52}
            headerHeight={44}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            context={gridContext}
          />
        </div>
      )}

      {/* Add Liability Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Liability" width={600}>
        <LiabilityForm onSuccess={(data) => { void handleSave(data); }} isLoading={createLiability.isPending} />
      </Modal>
    </div>
  );
}
