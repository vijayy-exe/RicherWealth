"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  usePreciousMetalHoldings,
  usePreciousMetalSummary,
  useCreatePreciousMetal,
  useDeletePreciousMetal,
  type PreciousMetalRow,
  type MetalType,
  type MetalSubType,
  type CreatePreciousMetalDto,
} from "@/hooks/usePreciousMetals";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

// ─── Shared style tokens ────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--color-text-muted)", marginBottom: "0.375rem", display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.625rem 0.875rem", background: "var(--color-bg-input)",
  border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none",
};

const METAL_COLORS: Record<MetalType, string> = { GOLD: "#F5A623", SILVER: "#94A3B8" };
const SUBTYPE_LABEL: Record<MetalSubType, string> = { PHYSICAL: "Physical", DIGITAL: "Digital", ETF: "ETF", JEWELLERY: "Jewellery" };

function MetalBadge({ type }: { type: MetalType }) {
  const color = METAL_COLORS[type];
  return (
    <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)", background: `${color}22`, color }}>
      {type === "GOLD" ? "🥇 Gold" : "🥈 Silver"}
    </span>
  );
}

// ─── Add Precious Metal Modal ───────────────────────────────────────────────

function AddMetalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    metalType: "GOLD" as MetalType,
    subType: "PHYSICAL" as MetalSubType,
    name: "",
    weightGrams: undefined as number | undefined,
    purityFraction: undefined as number | undefined,
    quantity: undefined as number | undefined,
    avgBuyPrice: 0,
    makingCharge: undefined as number | undefined,
    currency: "INR",
  });

  const { mutate: create, isPending, error } = useCreatePreciousMetal();
  const isPhysicalLike = form.subType === "PHYSICAL" || form.subType === "JEWELLERY";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dto: CreatePreciousMetalDto = {
      metalType: form.metalType,
      subType: form.subType,
      name: form.name,
      avgBuyPrice: form.avgBuyPrice,
      currency: form.currency,
      ...(isPhysicalLike
        ? { weightGrams: form.weightGrams ?? 0, purityFraction: form.purityFraction ?? 1 }
        : { quantity: form.quantity ?? 0 }),
      ...(form.subType === "JEWELLERY" && form.makingCharge !== undefined && { makingCharge: form.makingCharge }),
    };
    create(dto, { onSuccess: onClose });
  };

  const field = (id: string, label: React.ReactNode, node: React.ReactNode) => (
    <div key={id}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {node}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Add Precious Metal" width={440}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        {field("metal-type", "Metal",
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
            {(["GOLD", "SILVER"] as MetalType[]).map((t) => (
              <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, metalType: t }))}
                style={{
                  padding: "0.5rem", fontSize: "0.75rem", fontWeight: 700, borderRadius: "var(--radius-md)", cursor: "pointer",
                  border: `1px solid ${form.metalType === t ? "var(--color-accent)" : "var(--color-border-glass)"}`,
                  background: form.metalType === t ? "var(--color-accent)" : "var(--color-bg-input)",
                  color: form.metalType === t ? "#fff" : "var(--color-text-secondary)",
                }}>
                {t === "GOLD" ? "🥇 Gold" : "🥈 Silver"}
              </button>
            ))}
          </div>
        )}

        {field("sub-type", "Form",
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
            {(["PHYSICAL", "DIGITAL", "ETF", "JEWELLERY"] as MetalSubType[]).map((t) => (
              <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, subType: t }))}
                style={{
                  padding: "0.5rem 0.25rem", fontSize: "0.6875rem", fontWeight: 700, borderRadius: "var(--radius-md)", cursor: "pointer",
                  border: `1px solid ${form.subType === t ? "var(--color-accent)" : "var(--color-border-glass)"}`,
                  background: form.subType === t ? "var(--color-accent)" : "var(--color-bg-input)",
                  color: form.subType === t ? "#fff" : "var(--color-text-secondary)",
                }}>
                {SUBTYPE_LABEL[t]}
              </button>
            ))}
          </div>
        )}

        {field("name", "Name", (
          <input id="name" type="text" required value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Gold bars, SGB units" style={inputStyle} />
        ))}

        {isPhysicalLike ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {field("weight-grams", "Weight (grams)",
              <input id="weight-grams" type="number" min="0" step="0.001" required value={form.weightGrams ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, weightGrams: parseFloat(e.target.value) }))} style={inputStyle} />
            )}
            {field("purity", "Purity",
              <select id="purity" required value={form.purityFraction ?? ""} style={inputStyle}
                onChange={(e) => setForm((f) => ({ ...f, purityFraction: parseFloat(e.target.value) }))}>
                <option value="" disabled>Select purity</option>
                <option value="0.9999">24K (999.9)</option>
                <option value="0.9167">22K</option>
                <option value="0.75">18K</option>
                <option value="0.999">Fine Silver (999)</option>
                <option value="0.925">Sterling Silver (925)</option>
              </select>
            )}
          </div>
        ) : (
          field("quantity", "Quantity (grams equivalent)",
            <input id="quantity" type="number" min="0" step="0.001" required value={form.quantity ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) }))} style={inputStyle} />
          )
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: "1rem" }}>
          {field("avg-buy-price", "Avg. Buy Price / gram",
            <input id="avg-buy-price" type="number" min="0" step="0.01" required value={form.avgBuyPrice}
              onChange={(e) => setForm((f) => ({ ...f, avgBuyPrice: parseFloat(e.target.value) }))} style={inputStyle} />
          )}
          {field("currency", "Currency",
            <select id="currency" value={form.currency} style={inputStyle}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              <option value="INR">INR ₹</option>
              <option value="USD">USD $</option>
              <option value="EUR">EUR €</option>
            </select>
          )}
        </div>

        {form.subType === "JEWELLERY" && field("making-charge", <span>Making Charge <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional, flat amount)</span></span>,
          <input id="making-charge" type="number" min="0" step="0.01" value={form.makingCharge ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, makingCharge: e.target.value ? parseFloat(e.target.value) : undefined }))} style={inputStyle} />
        )}

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}

        <button type="submit" disabled={isPending} className="btn-accent" style={{ width: "100%", opacity: isPending ? 0.5 : 1 }}>
          {isPending ? "Adding…" : "Add Holding"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Holding Row ──────────────────────────────────────────────────────────────

function MetalRow({ holding }: { holding: PreciousMetalRow }) {
  const { mutate: deleteHolding } = useDeletePreciousMetal();
  const { analytics } = holding;
  const isGain = analytics.totalGainAbs >= 0;

  return (
    <tr
      style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-card-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.8125rem" }}>{holding.name}</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginTop: 2 }}>{SUBTYPE_LABEL[holding.subType]}</div>
      </td>
      <td style={{ padding: "1rem" }}><MetalBadge type={holding.metalType} /></td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {holding.weightGrams ? `${holding.weightGrams}g @ ${((holding.purityFraction ?? 1) * 100).toFixed(1)}%` : `${holding.quantity}g`}
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {analytics.spotPricePerGram !== null ? `${formatCurrency(analytics.spotPricePerGram, holding.currency)}/g` : "—"}
        {analytics.isStale && <span style={{ marginLeft: 4, fontSize: "0.625rem", color: "var(--color-text-muted)" }} title="Price may be stale">⏱</span>}
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 600, color: isGain ? "var(--color-gain)" : "var(--color-loss)" }}>
        {isGain ? "+" : ""}{analytics.totalGainPct.toFixed(1)}%
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
        {formatCurrency(analytics.marketValue, holding.currency)}
      </td>
      <td style={{ padding: "1rem", textAlign: "right" }}>
        <button
          onClick={() => { if (confirm(`Remove ${holding.name}?`)) deleteHolding(holding.id); }}
          style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-loss)", opacity: 0.7, background: "transparent", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)" }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PreciousMetalsPage() {
  const { data: holdings, isLoading, error } = usePreciousMetalHoldings();
  const { data: summary } = usePreciousMetalSummary();
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>Precious Metals</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>Gold &amp; silver — physical, digital, ETF &amp; jewellery</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-accent">+ Add Holding</button>
      </motion.div>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Total Value</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>{formatCurrency(summary.totalValue, summary.currency)}</div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>{summary.count} holding{summary.count !== 1 ? "s" : ""}</p>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Total Cost Basis</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>{formatCurrency(summary.totalCost, summary.currency)}</div>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Unrealized Gain</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: summary.totalValue - summary.totalCost >= 0 ? "var(--color-gain)" : "var(--color-loss)" }}>
              {formatCurrency(summary.totalValue - summary.totalCost, summary.currency)}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>
              {summary.totalCost > 0 ? `${(((summary.totalValue - summary.totalCost) / summary.totalCost) * 100).toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "1rem" }}>Your Holdings</h2>

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[...Array(3)].map((_, i) => <div key={i} className="glass-card" style={{ height: 56, animation: "pulse 1.5s ease-in-out infinite" }} />)}
          </div>
        )}

        {error && (
          <div className="glass-card" style={{ padding: "1.5rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-loss)" }}>{error.message}</p>
          </div>
        )}

        {!isLoading && !error && (!holdings || holdings.length === 0) && (
          <div className="glass-card" style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <Coins size={36} color="var(--color-text-muted)" />
            </div>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.375rem" }}>No precious metal holdings yet</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
              Track physical gold/silver, digital gold, ETFs, and jewellery with live spot pricing.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-accent">Add Your First Holding</button>
          </div>
        )}

        {holdings && holdings.length > 0 && (
          <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border-glass)", background: "var(--color-bg-input)" }}>
                    {["Holding", "Metal", "Weight / Qty", "Spot Price", "Gain", "Value", ""].map((h, i) => (
                      <th key={h} style={{ padding: "0.75rem 1rem", textAlign: i === 0 ? "left" : "right", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => <MetalRow key={h.id} holding={h} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <AddMetalModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
