"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Landmark } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  useBondHoldings,
  useBondSummary,
  useCreateBondHolding,
  useDeleteBondHolding,
  type BondHoldingRow,
  type BondType,
  type CreateBondHoldingDto,
} from "@/hooks/useBonds";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

// ─── Shared style tokens ────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: "0.375rem",
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  background: "var(--color-bg-input)",
  border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)",
  fontSize: "0.875rem",
  outline: "none",
};

// ─── Bond Type Badge ──────────────────────────────────────────────────────────

const BOND_TYPE_COLORS: Record<BondType, string> = {
  GOVT: "var(--color-accent)",
  CORPORATE: "#B58EFF",
  MUNICIPAL: "#2DD4BF",
  SGB: "#F5A623",
};

function BondTypeBadge({ type }: { type: BondType }) {
  const color = BOND_TYPE_COLORS[type] ?? BOND_TYPE_COLORS.CORPORATE;
  return (
    <span
      style={{
        fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)",
        background: `${color}22`, color,
      }}
    >
      {type === "CORPORATE" ? "CORP" : type === "MUNICIPAL" ? "MUNI" : type}
    </span>
  );
}

// ─── Days to Maturity Pill ────────────────────────────────────────────────────

function MaturityPill({ days, isMatured }: { days: number; isMatured: boolean }) {
  if (isMatured) {
    return (
      <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)", background: "var(--color-bg-input)", color: "var(--color-text-muted)" }}>
        Matured
      </span>
    );
  }

  const color = days <= 90 ? "var(--color-loss)" : days <= 365 ? "#F5A623" : "var(--color-gain)";
  const bg = days <= 90 ? "var(--color-loss-muted)" : days <= 365 ? "rgba(245, 166, 35, 0.14)" : "var(--color-gain-muted)";

  return (
    <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)", background: bg, color }}>
      {days.toLocaleString()} days left
    </span>
  );
}

// ─── Add Bond Modal ───────────────────────────────────────────────────────────

function AddBondModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    issuer: "",
    bondType: "CORPORATE" as BondType,
    faceValue: 1000,
    couponRate: 0,
    maturityDate: "",
    quantityHeld: 1,
    purchasePrice: undefined as number | undefined,
    purchaseDate: undefined as string | undefined,
    isin: undefined as string | undefined,
    currencyCode: "INR",
  });

  const { mutate: createBond, isPending, error } = useCreateBondHolding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dto: CreateBondHoldingDto = {
      issuer: form.issuer,
      bondType: form.bondType,
      faceValue: form.faceValue,
      couponRate: form.couponRate,
      maturityDate: form.maturityDate,
      quantityHeld: form.quantityHeld,
      currencyCode: form.currencyCode,
      ...(form.purchasePrice !== undefined && { purchasePrice: form.purchasePrice }),
      ...(form.purchaseDate !== undefined && { purchaseDate: form.purchaseDate }),
      ...(form.isin !== undefined && { isin: form.isin }),
    };
    createBond(dto, { onSuccess: onClose });
  };

  const field = (id: string, label: React.ReactNode, node: React.ReactNode) => (
    <div key={id}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {node}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Add Bond" width={440}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        {field("issuer", "Issuer",
          <input id="issuer" type="text" required value={form.issuer}
            onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
            placeholder="e.g. REC Ltd, Govt of India" style={inputStyle} />
        )}

        {field("bond-type", "Bond Type",
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
            {(["GOVT", "CORPORATE", "MUNICIPAL", "SGB"] as BondType[]).map((t) => (
              <button
                key={t} type="button" id={`bond-type-${t.toLowerCase()}`}
                onClick={() => setForm((f) => ({ ...f, bondType: t }))}
                style={{
                  padding: "0.5rem", fontSize: "0.75rem", fontWeight: 700, borderRadius: "var(--radius-md)", cursor: "pointer",
                  border: `1px solid ${form.bondType === t ? "var(--color-accent)" : "var(--color-border-glass)"}`,
                  background: form.bondType === t ? "var(--color-accent)" : "var(--color-bg-input)",
                  color: form.bondType === t ? "#fff" : "var(--color-text-secondary)",
                }}
              >
                {t === "CORPORATE" ? "CORP" : t === "MUNICIPAL" ? "MUNI" : t}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {field("face-value", "Face Value (₹)",
            <input id="face-value" type="number" min="1" step="1" required value={form.faceValue}
              onChange={(e) => setForm((f) => ({ ...f, faceValue: parseFloat(e.target.value) }))} style={inputStyle} />
          )}
          {field("coupon-rate", "Coupon Rate %",
            <input id="coupon-rate" type="number" min="0" max="100" step="0.01" required value={form.couponRate}
              onChange={(e) => setForm((f) => ({ ...f, couponRate: parseFloat(e.target.value) }))}
              placeholder="e.g. 7.25" style={inputStyle} />
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {field("maturity-date", "Maturity Date",
            <input id="maturity-date" type="date" required value={form.maturityDate}
              onChange={(e) => setForm((f) => ({ ...f, maturityDate: e.target.value }))} style={inputStyle} />
          )}
          {field("quantity-held", "Quantity",
            <input id="quantity-held" type="number" min="1" step="1" required value={form.quantityHeld}
              onChange={(e) => setForm((f) => ({ ...f, quantityHeld: parseInt(e.target.value) }))} style={inputStyle} />
          )}
        </div>

        {field("purchase-price", <span>Purchase Price / Bond <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional)</span></span>,
          <input id="purchase-price" type="number" min="1" step="0.01" value={form.purchasePrice ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value ? parseFloat(e.target.value) : undefined }))}
            placeholder="e.g. 980" style={inputStyle} />
        )}

        {field("isin", <span>ISIN <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional)</span></span>,
          <input id="isin" type="text" value={form.isin ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, isin: e.target.value || undefined }))}
            placeholder="e.g. INE123A08045" style={inputStyle} />
        )}

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}

        <button id="add-bond-submit" type="submit" disabled={isPending} className="btn-accent" style={{ width: "100%", opacity: isPending ? 0.5 : 1 }}>
          {isPending ? "Adding Bond…" : "Add Bond"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Bond Row ─────────────────────────────────────────────────────────────────

function BondRow({ bond }: { bond: BondHoldingRow }) {
  const { mutate: deleteBond } = useDeleteBondHolding();
  const { analytics } = bond;

  return (
    <tr
      style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-card-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.8125rem" }}>{bond.issuer}</div>
        {bond.isin && <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>{bond.isin}</div>}
      </td>
      <td style={{ padding: "1rem" }}><BondTypeBadge type={bond.bondType} /></td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", color: "var(--color-text-primary)" }}>
        {formatCurrency(bond.faceValue, bond.currencyCode)}
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-gain)" }}>
        {bond.couponRate.toFixed(2)}%
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {bond.quantityHeld.toLocaleString()}
      </td>
      <td style={{ padding: "1rem" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", textAlign: "right" }}>{bond.maturityDate}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <MaturityPill days={analytics.daysToMaturity} isMatured={analytics.isMatured} />
        </div>
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-gain)" }}>
        {formatCurrency(analytics.annualCouponIncome, bond.currencyCode)}/yr
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
        {formatCurrency(analytics.currentValue, bond.currencyCode)}
      </td>
      <td style={{ padding: "1rem", textAlign: "right" }}>
        <button
          id={`delete-bond-${bond.id}`}
          onClick={() => { if (confirm(`Remove bond from ${bond.issuer}?`)) deleteBond(bond.id); }}
          style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-loss)", opacity: 0.7, background: "transparent", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)" }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BondsPage() {
  const { data: bonds, isLoading, error } = useBondHoldings();
  const { data: summary } = useBondSummary();
  const [showAddModal, setShowAddModal] = useState(false);

  // Server-computed and currency-converted (see useBondSummary) — bonds can
  // be in different currencies, so don't sum raw currentValue here.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
            Bonds
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            Fixed income · Govt, Corporate, Municipal &amp; SGB
          </p>
        </div>
        <button id="open-add-bond" onClick={() => setShowAddModal(true)} className="btn-accent">
          + Add Bond
        </button>
      </motion.div>

      {/* Summary */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Total Value</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
              {formatCurrency(summary.totalValue, summary.currency)}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>
              {summary.count} bond{summary.count !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Annual Coupon Income</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-gain)" }}>
              {formatCurrency(summary.annualIncome, summary.currency)}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>from coupon payments</p>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Avg Coupon Yield</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
              {summary.totalValue > 0 ? `${((summary.annualIncome / summary.totalValue) * 100).toFixed(2)}%` : "—"}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>income / portfolio value</p>
          </div>
        </div>
      )}

      {/* Holdings table */}
      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "1rem" }}>Your Holdings</h2>

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="glass-card" style={{ height: 56, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        )}

        {error && (
          <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-loss)" }}>{error.message}</p>
          </div>
        )}

        {!isLoading && !error && (!bonds || bonds.length === 0) && (
          <div className="glass-card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <Landmark size={36} color="var(--color-text-muted)" />
            </div>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.375rem" }}>No bonds yet</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
              Track your government bonds, corporate bonds, and SGBs with coupon income and maturity dates.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-accent">Add Your First Bond</button>
          </div>
        )}

        {bonds && bonds.length > 0 && (
          <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border-glass)", background: "var(--color-bg-input)" }}>
                    {["Issuer", "Type", "Face Value", "Coupon", "Qty", "Maturity", "Annual Income", "Current Value", ""].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.75rem 1rem", textAlign: i === 0 ? "left" : "right",
                          fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bonds.map((bond) => <BondRow key={bond.id} bond={bond} />)}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid var(--color-border-glass)", background: "var(--color-bg-input)" }}>
                    <td colSpan={6} style={{ padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                      Totals
                    </td>
                    <td className="num" style={{ padding: "0.75rem 1rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-gain)" }}>
                      {summary ? `${formatCurrency(summary.annualIncome, summary.currency)}/yr` : "—"}
                    </td>
                    <td className="num" style={{ padding: "0.75rem 1rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
                      {summary ? formatCurrency(summary.totalValue, summary.currency) : "—"}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* YTM note */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.875rem 1rem", borderRadius: "var(--radius-md)", background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
        <span>ℹ️</span>
        <span>
          <strong style={{ color: "var(--color-text-secondary)" }}>YTM (Yield to Maturity)</strong> requires live market price data and is scheduled for Phase 6.
          Current value is shown at face value (par).
        </span>
      </div>

      <AddBondModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
