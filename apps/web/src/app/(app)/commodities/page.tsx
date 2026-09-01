"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Fuel } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  useCommodityHoldings,
  useCommoditySummary,
  useCreateCommodity,
  useDeleteCommodity,
  type CommodityRow,
  type CommodityType,
  type CreateCommodityDto,
} from "@/hooks/useCommodities";

function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
  color: "var(--color-text-muted)", marginBottom: "0.375rem", display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.625rem 0.875rem", background: "var(--color-bg-input)",
  border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none",
};

const COMMODITY_META: Record<CommodityType, { label: string; icon: string; color: string; unit: string }> = {
  OIL: { label: "Crude Oil", icon: "🛢️", color: "#3D3D3D", unit: "barrels" },
  NATURAL_GAS: { label: "Natural Gas", icon: "🔥", color: "#FF7043", unit: "MMBtu" },
  WHEAT: { label: "Wheat", icon: "🌾", color: "#D4A94A", unit: "bushels" },
  COFFEE: { label: "Coffee", icon: "☕", color: "#6F4E37", unit: "lbs" },
  CORN: { label: "Corn", icon: "🌽", color: "#F5C518", unit: "bushels" },
  COPPER: { label: "Copper", icon: "🔶", color: "#B87333", unit: "lbs" },
};

function CommodityBadge({ type }: { type: CommodityType }) {
  const meta = COMMODITY_META[type];
  return (
    <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)", background: `${meta.color}22`, color: meta.color }}>
      {meta.icon} {meta.label}
    </span>
  );
}

function AddCommodityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({
    commodityType: "OIL" as CommodityType,
    name: "",
    quantity: undefined as number | undefined,
    avgBuyPrice: 0,
    currency: "USD",
  });

  const { mutate: create, isPending, error } = useCreateCommodity();
  const meta = COMMODITY_META[form.commodityType];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dto: CreateCommodityDto = {
      commodityType: form.commodityType,
      name: form.name || `${meta.label} position`,
      quantity: form.quantity ?? 0,
      unit: meta.unit,
      avgBuyPrice: form.avgBuyPrice,
      currency: form.currency,
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
    <Modal open={open} onClose={onClose} title="Add Commodity" width={440}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        {field("commodity-type", "Commodity",
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
            {(Object.keys(COMMODITY_META) as CommodityType[]).map((t) => (
              <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, commodityType: t }))}
                style={{
                  padding: "0.5rem 0.25rem", fontSize: "0.6875rem", fontWeight: 700, borderRadius: "var(--radius-md)", cursor: "pointer",
                  border: `1px solid ${form.commodityType === t ? "var(--color-accent)" : "var(--color-border-glass)"}`,
                  background: form.commodityType === t ? "var(--color-accent)" : "var(--color-bg-input)",
                  color: form.commodityType === t ? "#fff" : "var(--color-text-secondary)",
                }}>
                {COMMODITY_META[t].icon} {COMMODITY_META[t].label}
              </button>
            ))}
          </div>
        )}

        {field("name", <span>Name <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional)</span></span>,
          <input id="name" type="text" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={`e.g. ${meta.label} position`} style={inputStyle} />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {field("quantity", `Quantity (${meta.unit})`,
            <input id="quantity" type="number" min="0" step="0.01" required value={form.quantity ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) }))} style={inputStyle} />
          )}
          {field("avg-buy-price", "Avg. Buy Price (USD)",
            <input id="avg-buy-price" type="number" min="0" step="0.01" required value={form.avgBuyPrice}
              onChange={(e) => setForm((f) => ({ ...f, avgBuyPrice: parseFloat(e.target.value) }))} style={inputStyle} />
          )}
        </div>

        {field("currency", "Currency",
          <select id="currency" value={form.currency} style={inputStyle}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
            <option value="USD">USD $</option>
            <option value="INR">INR ₹</option>
            <option value="EUR">EUR €</option>
          </select>
        )}

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}

        <button type="submit" disabled={isPending} className="btn-accent" style={{ width: "100%", opacity: isPending ? 0.5 : 1 }}>
          {isPending ? "Adding…" : "Add Position"}
        </button>
      </form>
    </Modal>
  );
}

function CommodityHoldingRow({ holding }: { holding: CommodityRow }) {
  const { mutate: deleteHolding } = useDeleteCommodity();
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
      </td>
      <td style={{ padding: "1rem" }}><CommodityBadge type={holding.commodityType} /></td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {holding.quantity.toLocaleString()} {holding.unit}
      </td>
      <td className="num" style={{ padding: "1rem", textAlign: "right", fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        {analytics.livePrice !== null ? formatCurrency(analytics.livePrice, "USD") : "—"}
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

export default function CommoditiesPage() {
  const { data: holdings, isLoading, error } = useCommodityHoldings();
  const { data: summary } = useCommoditySummary();
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>Commodities</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>Oil, natural gas, wheat, coffee, corn &amp; copper</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-accent">+ Add Position</button>
      </motion.div>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Total Value</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>{formatCurrency(summary.totalValue, summary.currency)}</div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>{summary.count} position{summary.count !== 1 ? "s" : ""}</p>
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
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "1rem" }}>Your Positions</h2>

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
              <Fuel size={36} color="var(--color-text-muted)" />
            </div>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.375rem" }}>No commodity positions yet</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
              Track oil, natural gas, wheat, coffee, corn, and copper with live futures pricing.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-accent">Add Your First Position</button>
          </div>
        )}

        {holdings && holdings.length > 0 && (
          <div className="glass-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border-glass)", background: "var(--color-bg-input)" }}>
                    {["Position", "Commodity", "Quantity", "Live Price", "Gain", "Value", ""].map((h, i) => (
                      <th key={h} style={{ padding: "0.75rem 1rem", textAlign: i === 0 ? "left" : "right", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => <CommodityHoldingRow key={h.id} holding={h} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <AddCommodityModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
