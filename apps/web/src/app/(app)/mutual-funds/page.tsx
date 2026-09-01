"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Landmark, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  useMutualFundHoldings,
  useMutualFundSummary,
  useCreateMutualFundHolding,
  useDeleteMutualFundHolding,
  useAddSipInstallment,
  useSchemeSearch,
  useNavHistory,
} from "@/hooks/useMutualFunds";
import type { MfHoldingRow, CreateMfHoldingDto, AddSipInstallmentDto } from "@/types/mutual-funds";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

function formatXirr(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(2)}%`;
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

const statBoxStyle: React.CSSProperties = {
  background: "var(--color-bg-input)",
  borderRadius: "var(--radius-md)",
  padding: "0.75rem",
};

// ─── NAV Sparkline ────────────────────────────────────────────────────────────

function NavSparkline({ assetId, positive }: { assetId: string; positive: boolean }) {
  const { data } = useNavHistory(assetId, 90);

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 40,
          width: 96,
          borderRadius: "var(--radius-sm)",
          background: "var(--color-bg-input)",
        }}
      />
    );
  }

  const color = positive ? "var(--color-gain)" : "var(--color-loss)";

  return (
    <div style={{ height: 40, width: 96 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="nav" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <XAxis dataKey="date" hide />
          <YAxis hide domain={["auto", "auto"]} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Scheme Search Typeahead ──────────────────────────────────────────────────

function SchemeSearch({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (code: string, name: string) => void;
}) {
  const { data: results, isLoading } = useSchemeSearch(value);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
        <input
          id="scheme-search"
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search fund name or scheme code…"
          autoComplete="off"
          style={{ ...inputStyle, paddingLeft: "2rem" }}
        />
        {isLoading && (
          <div
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              width: 14, height: 14, borderRadius: "50%",
              border: "2px solid var(--color-accent)", borderTopColor: "transparent",
              animation: "spin 0.7s linear infinite",
            }}
          />
        )}
      </div>
      {open && results && results.length > 0 && (
        <div
          style={{
            position: "absolute", zIndex: 50, marginTop: 4, width: "100%",
            background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-md)", boxShadow: "0 12px 32px rgba(0,0,0,0.5)", overflow: "hidden",
          }}
        >
          {results.map((r) => (
            <button
              key={r.schemeCode}
              type="button"
              onMouseDown={() => { onSelect(r.schemeCode, r.schemeName); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "0.625rem 0.875rem",
                background: "transparent", border: "none", cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-card-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.schemeName}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                Code: {r.schemeCode}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Fund Modal ───────────────────────────────────────────────────────────

function AddFundModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    schemeCode: "",
    fundName: "",
    investmentType: "LUMPSUM" as "SIP" | "LUMPSUM",
    unitsHeld: 0,
    avgNAV: 0,
    expenseRatio: undefined as number | undefined,
    currencyCode: "INR",
  });

  const { mutate: createHolding, isPending, error } = useCreateMutualFundHolding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.schemeCode || !form.fundName) return;
    const dto: CreateMfHoldingDto = {
      schemeCode: form.schemeCode,
      fundName: form.fundName,
      investmentType: form.investmentType,
      unitsHeld: form.unitsHeld,
      avgNAV: form.avgNAV,
      currencyCode: form.currencyCode,
      ...(form.expenseRatio !== undefined && { expenseRatio: form.expenseRatio }),
    };
    createHolding(dto, { onSuccess: onClose });
  };

  const handleSchemeSelect = (code: string, name: string) => {
    setSearchQuery(name);
    setForm((f) => ({ ...f, schemeCode: code, fundName: name }));
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Mutual Fund" width={440}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        <div>
          <label style={labelStyle} htmlFor="scheme-search">Fund / Scheme</label>
          <SchemeSearch value={searchQuery} onChange={setSearchQuery} onSelect={handleSchemeSelect} />
          {form.schemeCode && (
            <p style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--color-accent)" }}>✓ Code: {form.schemeCode}</p>
          )}
        </div>

        <div>
          <label style={labelStyle}>Investment Type</label>
          <div style={{ display: "flex", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--color-border-glass)" }}>
            {(["LUMPSUM", "SIP"] as const).map((type) => (
              <button
                key={type}
                type="button"
                id={`type-${type.toLowerCase()}`}
                onClick={() => setForm((f) => ({ ...f, investmentType: type }))}
                style={{
                  flex: 1, padding: "0.625rem", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", border: "none",
                  background: form.investmentType === type ? "var(--color-accent)" : "transparent",
                  color: form.investmentType === type ? "#fff" : "var(--color-text-secondary)",
                  transition: "background 0.15s ease",
                }}
              >
                {type === "LUMPSUM" ? "Lumpsum" : "SIP"}
              </button>
            ))}
          </div>
        </div>

        {form.investmentType === "SIP" && (
          <div>
            <label style={labelStyle} htmlFor="sip-frequency">SIP Frequency</label>
            <select id="sip-frequency" defaultValue="MONTHLY" style={inputStyle}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle} htmlFor="units-held">Units Held</label>
          <input
            id="units-held" type="number" min="0.001" step="0.001" required
            value={form.unitsHeld || ""}
            onChange={(e) => setForm((f) => ({ ...f, unitsHeld: parseFloat(e.target.value) }))}
            placeholder="e.g. 128.456" style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="avg-nav">Avg NAV (₹)</label>
          <input
            id="avg-nav" type="number" min="0.01" step="0.01" required
            value={form.avgNAV || ""}
            onChange={(e) => setForm((f) => ({ ...f, avgNAV: parseFloat(e.target.value) }))}
            placeholder="e.g. 52.34" style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="expense-ratio">
            Expense Ratio % <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional)</span>
          </label>
          <input
            id="expense-ratio" type="number" min="0" max="5" step="0.01"
            value={form.expenseRatio ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, expenseRatio: e.target.value ? parseFloat(e.target.value) : undefined }))}
            placeholder="e.g. 0.5" style={inputStyle}
          />
        </div>

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}

        <button id="add-fund-submit" type="submit" disabled={isPending || !form.schemeCode} className="btn-accent" style={{ width: "100%", opacity: isPending || !form.schemeCode ? 0.5 : 1 }}>
          {isPending ? "Adding Fund…" : "Add Fund"}
        </button>
      </form>
    </Modal>
  );
}

// ─── SIP Installment Modal ─────────────────────────────────────────────────────

function SipInstallmentModal({ holding, onClose }: { holding: MfHoldingRow; onClose: () => void }) {
  const [form, setForm] = useState<AddSipInstallmentDto>({
    amount: 0,
    units: 0,
    nav: holding.analytics.latestNAV ?? holding.avgNAV,
    date: new Date().toISOString().slice(0, 10),
  });

  const { mutate: addSip, isPending, error } = useAddSipInstallment();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addSip({ assetId: holding.id, dto: form }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} title="Add SIP Installment" width={400}>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "-0.5rem", marginBottom: "1.125rem" }}>
        {holding.fundName}
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={labelStyle} htmlFor="sip-amount">Amount (₹)</label>
          <input id="sip-amount" type="number" min="1" step="1" required value={form.amount || ""}
            onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) }))}
            placeholder="e.g. 5000" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="sip-units">Units Allotted</label>
          <input id="sip-units" type="number" min="0.001" step="0.001" required value={form.units || ""}
            onChange={(e) => setForm((f) => ({ ...f, units: parseFloat(e.target.value) }))}
            placeholder="e.g. 94.56" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label style={labelStyle} htmlFor="sip-nav">NAV (₹)</label>
            <input id="sip-nav" type="number" min="0.01" step="0.01" required value={form.nav || ""}
              onChange={(e) => setForm((f) => ({ ...f, nav: parseFloat(e.target.value) }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="sip-date">Date</label>
            <input id="sip-date" type="date" required value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "0.625rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-glass)", background: "transparent", color: "var(--color-text-secondary)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button id="sip-submit" type="submit" disabled={isPending} className="btn-accent" style={{ flex: 1, opacity: isPending ? 0.5 : 1 }}>
            {isPending ? "Saving…" : "Add Installment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Holding Card ─────────────────────────────────────────────────────────────

function HoldingCard({ holding, index }: { holding: MfHoldingRow; index: number }) {
  const [showSipForm, setShowSipForm] = useState(false);
  const [showSips, setShowSips] = useState(false);
  const { mutate: deleteHolding } = useDeleteMutualFundHolding();

  const { analytics } = holding;
  const isPositive = analytics.absoluteReturn >= 0;
  const trendColor = isPositive ? "var(--color-gain)" : "var(--color-loss)";
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
        className="glass-card"
        style={{ padding: "1.25rem" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{
                fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)",
                background: "var(--color-accent-muted)", color: "var(--color-accent)",
              }}>
                {holding.investmentType}
              </span>
              {analytics.sipCount > 0 && (
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{analytics.sipCount} installments</span>
              )}
            </div>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {holding.fundName}
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>Code: {holding.schemeCode}</p>
          </div>
          <NavSparkline assetId={holding.id} positive={isPositive} />
        </div>

        {/* Current value */}
        <div style={{ marginBottom: "1rem" }}>
          <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
            {formatCurrency(analytics.currentValue, holding.currencyCode)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <TrendIcon size={13} color={trendColor} />
            <span className="num" style={{ fontSize: "0.8125rem", fontWeight: 600, color: trendColor }}>
              {formatCurrency(Math.abs(analytics.absoluteReturn), holding.currencyCode)}
            </span>
            <span className={isPositive ? "badge-gain" : "badge-loss"}>{formatPct(analytics.absoluteReturnPct)}</span>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem", marginBottom: "1rem" }}>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginBottom: 2 }}>Invested</div>
            <div className="num" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
              {formatCurrency(analytics.totalInvested, holding.currencyCode)}
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginBottom: 2 }}>Latest NAV</div>
            <div className="num" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
              ₹{analytics.latestNAV?.toFixed(4) ?? "—"}
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginBottom: 2 }}>XIRR</div>
            <div className="num" style={{ fontSize: "0.8125rem", fontWeight: 600, color: analytics.xirr == null ? "var(--color-text-muted)" : analytics.xirr >= 0 ? "var(--color-gain)" : "var(--color-loss)" }}>
              {formatXirr(analytics.xirr)}
            </div>
          </div>
          <div style={statBoxStyle}>
            <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginBottom: 2 }}>CAGR</div>
            <div className="num" style={{ fontSize: "0.8125rem", fontWeight: 600, color: analytics.cagr == null ? "var(--color-text-muted)" : analytics.cagr >= 0 ? "var(--color-gain)" : "var(--color-loss)" }}>
              {analytics.cagr != null ? formatXirr(analytics.cagr) : "—"}
            </div>
          </div>
        </div>

        {analytics.expenseRatioImpact != null && (
          <div style={{ fontSize: "0.75rem", color: "#F5A623", background: "rgba(245, 166, 35, 0.1)", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.75rem", marginBottom: "1rem" }}>
            ~{formatCurrency(analytics.expenseRatioImpact, holding.currencyCode)}/yr in expense ratio drag
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {holding.investmentType === "SIP" && (
            <button
              id={`add-sip-${holding.id}`}
              onClick={() => setShowSipForm(true)}
              style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.375rem 0.75rem", borderRadius: "var(--radius-sm)", background: "var(--color-accent-muted)", color: "var(--color-accent)", border: "none", cursor: "pointer" }}
            >
              + Installment
            </button>
          )}
          {holding.sipInstallments.length > 0 && (
            <button
              onClick={() => setShowSips((s) => !s)}
              style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.375rem 0.75rem", borderRadius: "var(--radius-sm)", background: "var(--color-bg-input)", color: "var(--color-text-secondary)", border: "none", cursor: "pointer" }}
            >
              {showSips ? "Hide SIPs" : "View SIPs"}
            </button>
          )}
          <button
            id={`delete-mf-${holding.id}`}
            onClick={() => { if (confirm(`Remove ${holding.fundName}?`)) deleteHolding(holding.id); }}
            style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 600, padding: "0.375rem 0.75rem", borderRadius: "var(--radius-sm)", background: "transparent", color: "var(--color-loss)", opacity: 0.7, border: "none", cursor: "pointer" }}
          >
            Remove
          </button>
        </div>

        {showSips && holding.sipInstallments.length > 0 && (
          <div style={{ marginTop: "1rem", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {holding.sipInstallments.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--color-text-muted)" }}>{s.date}</span>
                <span className="num" style={{ color: "var(--color-text-secondary)" }}>{formatCurrency(s.amount, holding.currencyCode)}</span>
                <span style={{ color: "var(--color-text-muted)" }}>{s.units.toFixed(4)} units @ ₹{s.nav}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {showSipForm && <SipInstallmentModal holding={holding} onClose={() => setShowSipForm(false)} />}
    </>
  );
}

// ─── Coming Soon Card ─────────────────────────────────────────────────────────

function ComingSoonCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center", borderStyle: "dashed" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 12px", borderRadius: "var(--radius-full)", background: "var(--color-accent-muted)", marginBottom: "0.75rem" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent)", animation: "pulse 2s ease-in-out infinite" }} />
        <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-accent)" }}>Coming Soon</span>
      </div>
      <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>{title}</h4>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", maxWidth: 280, margin: "0 auto" }}>{description}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MutualFundsPage() {
  const { data: holdings, isLoading, error } = useMutualFundHoldings();
  const { data: summary } = useMutualFundSummary();
  const [showAddModal, setShowAddModal] = useState(false);

  // Server-computed and currency-converted (see useMutualFundSummary) — do
  // NOT sum holdings.analytics.currentValue directly here, holdings can be
  // in different currencies and a raw sum would silently be wrong.
  const totalGain = summary ? summary.totalValue - summary.totalInvested : 0;
  const isGainPositive = totalGain >= 0;

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
            Mutual Funds
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
            MFAPI.in · NAV synced daily · XIRR powered
          </p>
        </div>
        <button id="open-add-fund" onClick={() => setShowAddModal(true)} className="btn-accent">
          + Add Fund
        </button>
      </motion.div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Current Value</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
              {formatCurrency(summary.totalValue, summary.currency)}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>
              {summary.count} fund{summary.count !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Total Invested</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
              {formatCurrency(summary.totalInvested, summary.currency)}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>across all holdings (converted to {summary.currency})</p>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Total Gain</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: isGainPositive ? "var(--color-gain)" : "var(--color-loss)" }}>
              {formatCurrency(totalGain, summary.currency)}
            </div>
            <p style={{ fontSize: "0.75rem", marginTop: "0.375rem", color: isGainPositive ? "var(--color-gain)" : "var(--color-loss)" }}>
              {formatPct(summary.totalInvested > 0 ? (totalGain / summary.totalInvested) * 100 : null)}
            </p>
          </div>
        </div>
      )}

      {/* Holdings */}
      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "1rem" }}>Your Holdings</h2>

        {isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="glass-card" style={{ height: 260, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        )}

        {error && (
          <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center", borderColor: "var(--color-loss)" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-loss)" }}>{error.message}</p>
          </div>
        )}

        {!isLoading && !error && (!holdings || holdings.length === 0) && (
          <div className="glass-card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <Landmark size={36} color="var(--color-text-muted)" />
            </div>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.375rem" }}>No funds yet</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
              Add your first mutual fund holding to start tracking NAV, SIPs, and XIRR.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-accent">Add Your First Fund</button>
          </div>
        )}

        {holdings && holdings.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {holdings.map((h, i) => (
              <HoldingCard key={h.id} holding={h} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Stubs */}
      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "1rem" }}>Analytics</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          <ComingSoonCard
            title="Portfolio Overlap"
            description="See how much your funds overlap in their underlying stock holdings. Requires provider data."
          />
          <ComingSoonCard
            title="Rolling Returns"
            description="1Y / 3Y / 5Y rolling return analysis to evaluate consistency. Coming in Phase 6."
          />
        </div>
      </section>

      <AddFundModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
