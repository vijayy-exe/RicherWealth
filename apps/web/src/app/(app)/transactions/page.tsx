"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AgGridReact } from "ag-grid-react";
import { ClientSideRowModelModule, type ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { Modal } from "@/components/ui/Modal";
import { ExpenseForm, type ExpenseFormValues } from "@/components/forms/ExpenseForm";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { BankSyncPanel } from "@/components/transactions/BankSyncPanel";
import { SubscriptionsPanel } from "@/components/transactions/SubscriptionsPanel";
import { ExportButton } from "@/components/ExportButton";
import {
  useTransactions, useCashFlow, useCreateTransaction, useRecategorizeTransaction, useDeleteTransaction,
  type TransactionRow, type ExpenseCategory,
} from "@/hooks/useTransactions";

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  TRAVEL: { label: "Travel", icon: "✈️", color: "#3D83FF" },
  SHOPPING: { label: "Shopping", icon: "🛍️", color: "#A78BFA" },
  FOOD: { label: "Food", icon: "🍔", color: "#F5A623" },
  UTILITIES: { label: "Utilities", icon: "💡", color: "#38BDF8" },
  HEALTHCARE: { label: "Healthcare", icon: "🏥", color: "#FF4D6D" },
  ENTERTAINMENT: { label: "Entertainment", icon: "🎬", color: "#9B59B6" },
  SUBSCRIPTIONS: { label: "Subscriptions", icon: "🔁", color: "#00D97E" },
  BILLS: { label: "Bills", icon: "🧾", color: "#E74C3C" },
  OTHER: { label: "Other", icon: "📋", color: "#5C6880" },
};

const CATEGORY_VALUES: ExpenseCategory[] = ["TRAVEL", "SHOPPING", "FOOD", "UTILITIES", "HEALTHCARE", "ENTERTAINMENT", "SUBSCRIPTIONS", "BILLS", "OTHER"];

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual", bank_sync: "Bank Sync", csv_import: "CSV Import", pdf_import: "PDF Import",
};

export default function TransactionsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const { data: transactions = [], isLoading } = useTransactions(reviewOnly ? { needsReview: true } : undefined);
  const { data: cashFlow = [] } = useCashFlow(12);
  const createTransaction = useCreateTransaction();
  const recategorize = useRecategorizeTransaction();
  const deleteTransaction = useDeleteTransaction();

  const needsReviewCount = transactions.filter((t) => t.needsCategoryReview).length;
  const currency = transactions[0]?.currencyCode ?? "INR";

  const handleDelete = (id: string) => {
    if (confirm("Delete this transaction?")) deleteTransaction.mutate(id);
  };

  const handleRecategorize = (id: string, category: string) => {
    recategorize.mutate({ id, category: category as ExpenseCategory });
  };

  const gridContext = useMemo(() => ({ onDelete: handleDelete, onRecategorize: handleRecategorize }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (data: ExpenseFormValues) => {
    await createTransaction.mutateAsync({
      type: "expense",
      amount: data.amount,
      currencyCode: data.currencyCode,
      date: new Date(data.date).toISOString(),
      merchant: data.merchant,
      ...(data.category && { category: data.category }),
      source: "manual",
    });
    setModalOpen(false);
  };

  const columnDefs: ColDef<TransactionRow>[] = [
    {
      field: "date", headerName: "Date", width: 110,
      cellRenderer: (p: { data: TransactionRow }) => new Date(p.data.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      comparator: (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime(),
      sort: "desc" as const,
    },
    {
      field: "merchant", headerName: "Merchant / Description", flex: 2, minWidth: 180,
      cellRenderer: (p: { data: TransactionRow }) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
          <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{p.data.merchant ?? p.data.description ?? "—"}</span>
          {p.data.needsCategoryReview && (
            <span style={{ fontSize: "0.625rem", fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "var(--color-loss-muted, rgba(255,77,109,0.15))", color: "var(--color-loss)" }}>
              REVIEW
            </span>
          )}
        </div>
      ),
    },
    {
      field: "category", headerName: "Category", width: 190,
      cellRenderer: (p: { data: TransactionRow; context: { onRecategorize: (id: string, category: string) => void } }) => {
        if (p.data.type !== "expense") return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
        const meta = p.data.category ? CATEGORY_META[p.data.category] : undefined;
        return (
          <select
            value={p.data.category ?? "OTHER"}
            onChange={(e) => p.context.onRecategorize(p.data.id, e.target.value)}
            style={{
              background: (meta?.color ?? "#5C6880") + "20", color: meta?.color ?? "#5C6880",
              border: "none", borderRadius: 20, padding: "3px 10px", fontSize: "0.75rem", fontWeight: 700,
              cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
          >
            {CATEGORY_VALUES.map((c) => (
              <option key={c} value={c} style={{ background: "var(--color-bg-card)", color: "var(--color-text-primary)" }}>
                {CATEGORY_META[c]?.icon} {CATEGORY_META[c]?.label}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      field: "amount", headerName: "Amount", width: 130,
      cellRenderer: (p: { data: TransactionRow }) => {
        const isIncome = p.data.type === "income";
        return (
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: isIncome ? "var(--color-gain)" : "var(--color-loss)" }}>
            {isIncome ? "+" : "−"}{new Intl.NumberFormat(undefined, { style: "currency", currency: p.data.currencyCode, maximumFractionDigits: 0 }).format(parseFloat(p.data.amount))}
          </span>
        );
      },
      comparator: (a: string, b: string) => parseFloat(a) - parseFloat(b),
    },
    {
      field: "source", headerName: "Source", width: 110,
      cellRenderer: (p: { data: TransactionRow }) => <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{SOURCE_LABEL[p.data.source] ?? p.data.source}</span>,
    },
    {
      headerName: "", width: 50, sortable: false, filter: false,
      cellRenderer: (p: { data: TransactionRow; context: { onDelete: (id: string) => void } }) => (
        <button onClick={() => p.context.onDelete(p.data.id)} style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1rem" }} title="Delete">
          🗑
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Transactions
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            Expenses, cash flow, subscriptions, and bank sync
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ExportButton dataset="transactions" />
          <button
            onClick={() => setModalOpen(true)}
            style={{
              padding: "0.75rem 1.5rem", background: "var(--color-loss)",
              border: "none", borderRadius: "var(--radius-md)", color: "#fff", fontWeight: 700, fontSize: "0.9375rem",
              cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
          >
            + Add Expense
          </button>
        </div>
      </div>

      <BankSyncPanel />

      {cashFlow.length > 0 && <CashFlowChart data={cashFlow} currency={currency} />}

      <SubscriptionsPanel />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          All Transactions
        </p>
        {needsReviewCount > 0 && (
          <button
            onClick={() => setReviewOnly((v) => !v)}
            style={{
              padding: "0.375rem 0.875rem", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
              border: reviewOnly ? "none" : "1px solid var(--color-border-glass)",
              background: reviewOnly ? "var(--color-loss)" : "transparent",
              color: reviewOnly ? "#fff" : "var(--color-loss)",
            }}
          >
            {reviewOnly ? "Showing" : ""} {needsReviewCount} needing review
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>Loading…</div>
      ) : transactions.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: "3rem", marginBottom: 12 }}>🧾</div>
          <p style={{ color: "var(--color-text-muted)" }}>
            {reviewOnly ? "Nothing needs review." : "No transactions yet — add an expense or connect a bank above."}
          </p>
        </motion.div>
      ) : (
        <div className="ag-theme-quartz-dark" style={{ height: Math.min(600, 56 + transactions.length * 48), width: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <AgGridReact
            modules={[ClientSideRowModelModule]}
            theme="legacy"
            rowData={transactions}
            columnDefs={columnDefs}
            rowHeight={48}
            headerHeight={44}
            defaultColDef={{ sortable: true, resizable: true }}
            context={gridContext}
          />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Expense" width={520}>
        <ExpenseForm onSuccess={(data) => { void handleSave(data); }} isLoading={createTransaction.isPending} />
      </Modal>
    </div>
  );
}
