"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Bitcoin, Search, Bell } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  useCryptoHoldings,
  useCryptoSummary,
  useCreateCryptoHolding,
  useDeleteCryptoHolding,
  useCoinSearch,
  usePriceAlerts,
  useCreatePriceAlert,
  useDeletePriceAlert,
} from "@/hooks/useCrypto";
import type { CryptoHoldingRow, CreateCryptoHoldingDto } from "@/types/crypto";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
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

// ─── Coin Search Typeahead ──────────────────────────────────────────────────

function CoinSearch({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (coinId: string, symbol: string, name: string) => void;
}) {
  const { data: results, isLoading } = useCoinSearch(value);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
        <input
          id="coin-search"
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search coin name or symbol…"
          autoComplete="off"
          style={{ ...inputStyle, paddingLeft: "2rem" }}
        />
        {isLoading && (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--color-accent)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
        )}
      </div>
      {open && results && results.length > 0 && (
        <div style={{ position: "absolute", zIndex: 50, marginTop: 4, width: "100%", maxHeight: 280, overflowY: "auto", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-md)", boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
          {results.map((r) => (
            <button
              key={r.coinId}
              type="button"
              onMouseDown={() => { onSelect(r.coinId, r.symbol, r.name); setOpen(false); }}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", padding: "0.625rem 0.875rem", background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-card-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--color-text-primary)" }}>{r.name}</span>
              <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>{r.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Holding Modal ─────────────────────────────────────────────────────────

function AddHoldingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    coinId: "", symbol: "", name: "",
    quantity: 0, avgBuyPrice: 0, currency: "USD",
    walletAddress: undefined as string | undefined,
  });

  const { mutate: createHolding, isPending, error } = useCreateCryptoHolding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.coinId) return;
    const dto: CreateCryptoHoldingDto = {
      coinId: form.coinId, symbol: form.symbol, name: form.name,
      quantity: form.quantity, avgBuyPrice: form.avgBuyPrice, currency: form.currency,
      ...(form.walletAddress ? { walletAddress: form.walletAddress } : {}),
    };
    createHolding(dto, { onSuccess: onClose });
  };

  const handleSelect = (coinId: string, symbol: string, name: string) => {
    setSearchQuery(`${name} (${symbol})`);
    setForm((f) => ({ ...f, coinId, symbol, name }));
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Crypto Holding" width={440}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
        <div>
          <label style={labelStyle} htmlFor="coin-search">Coin</label>
          <CoinSearch value={searchQuery} onChange={setSearchQuery} onSelect={handleSelect} />
          {form.coinId && (
            <p style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--color-accent)" }}>✓ {form.symbol} · {form.coinId}</p>
          )}
        </div>

        <div>
          <label style={labelStyle} htmlFor="quantity">Quantity</label>
          <input id="quantity" type="number" min="0.00000001" step="any" required value={form.quantity || ""}
            onChange={(e) => setForm((f) => ({ ...f, quantity: parseFloat(e.target.value) }))}
            placeholder="e.g. 0.5" style={inputStyle} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={labelStyle} htmlFor="avg-buy-price">Avg Buy Price</label>
            <input id="avg-buy-price" type="number" min="0.000001" step="any" required value={form.avgBuyPrice || ""}
              onChange={(e) => setForm((f) => ({ ...f, avgBuyPrice: parseFloat(e.target.value) }))}
              placeholder="e.g. 42000" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="currency">Currency</label>
            <select id="currency" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} style={inputStyle}>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="wallet-address">
            Wallet Address <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>(optional, public address only)</span>
          </label>
          <input id="wallet-address" type="text" value={form.walletAddress ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, walletAddress: e.target.value || undefined }))}
            placeholder="For read-only reference — never a private key" style={inputStyle} />
        </div>

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}

        <button id="add-crypto-submit" type="submit" disabled={isPending || !form.coinId} className="btn-accent" style={{ width: "100%", opacity: isPending || !form.coinId ? 0.5 : 1 }}>
          {isPending ? "Adding…" : "Add Holding"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Price Alert Modal ──────────────────────────────────────────────────────

function AlertModal({ holding, onClose }: { holding: CryptoHoldingRow; onClose: () => void }) {
  const [targetPrice, setTargetPrice] = useState(holding.analytics.livePrice ?? holding.avgBuyPrice);
  const [direction, setDirection] = useState<"ABOVE" | "BELOW">("ABOVE");
  const { mutate: createAlert, isPending, error } = useCreatePriceAlert();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAlert(
      { coinId: holding.coinId, symbol: holding.symbol, targetPrice, direction, currency: holding.currency },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal open onClose={onClose} title={`Price Alert — ${holding.symbol}`} width={380}>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "-0.5rem", marginBottom: "1.125rem" }}>
        Persists your target now — delivery (push/email) is coming in a later phase.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <label style={labelStyle}>Direction</label>
          <div style={{ display: "flex", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--color-border-glass)" }}>
            {(["ABOVE", "BELOW"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)}
                style={{ flex: 1, padding: "0.5rem", fontSize: "0.75rem", fontWeight: 700, border: "none", cursor: "pointer",
                  background: direction === d ? "var(--color-accent)" : "transparent",
                  color: direction === d ? "#fff" : "var(--color-text-secondary)" }}>
                {d === "ABOVE" ? "Goes Above" : "Falls Below"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="target-price">Target Price ({holding.currency})</label>
          <input id="target-price" type="number" min="0.000001" step="any" required value={targetPrice || ""}
            onChange={(e) => setTargetPrice(parseFloat(e.target.value))} style={inputStyle} />
        </div>
        {error && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", background: "var(--color-loss-muted)", padding: "0.625rem 0.75rem", borderRadius: "var(--radius-md)" }}>
            {error.message}
          </p>
        )}
        <button type="submit" disabled={isPending} className="btn-accent" style={{ width: "100%", opacity: isPending ? 0.5 : 1 }}>
          {isPending ? "Saving…" : "Set Alert"}
        </button>
      </form>
    </Modal>
  );
}

// ─── Holding Card ─────────────────────────────────────────────────────────────

function HoldingCard({ holding, index }: { holding: CryptoHoldingRow; index: number }) {
  const [showAlertModal, setShowAlertModal] = useState(false);
  const { mutate: deleteHolding } = useDeleteCryptoHolding();
  const { analytics } = holding;
  const isPositive = analytics.totalGainAbs >= 0;
  const trendColor = isPositive ? "var(--color-gain)" : "var(--color-loss)";
  const dayColor = (analytics.change24hPct ?? 0) >= 0 ? "var(--color-gain)" : "var(--color-loss)";
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "1px 8px", borderRadius: "var(--radius-full)", background: "var(--color-accent-muted)", color: "var(--color-accent)" }}>
                {holding.symbol}
              </span>
              {analytics.isStale && (
                <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>stale price</span>
              )}
            </div>
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-primary)" }}>{holding.name}</h3>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>
              {holding.quantity} {holding.symbol}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="num" style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
              {analytics.livePrice != null ? formatCurrency(analytics.livePrice, analytics.currency) : "—"}
            </div>
            {analytics.change24hPct != null && (
              <div className="num" style={{ fontSize: "0.75rem", fontWeight: 600, color: dayColor, marginTop: 2 }}>
                {formatPct(analytics.change24hPct)} 24h
              </div>
            )}
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>
            {formatCurrency(analytics.marketValue, analytics.currency)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <TrendIcon size={13} color={trendColor} />
            <span className="num" style={{ fontSize: "0.8125rem", fontWeight: 600, color: trendColor }}>
              {formatCurrency(Math.abs(analytics.totalGainAbs), analytics.currency)}
            </span>
            <span className={isPositive ? "badge-gain" : "badge-loss"}>{formatPct(analytics.totalGainPct)}</span>
          </div>
        </div>

        {holding.walletAddress && (
          <div style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)", marginBottom: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {holding.walletAddress}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => setShowAlertModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", fontWeight: 600, padding: "0.375rem 0.75rem", borderRadius: "var(--radius-sm)", background: "var(--color-accent-muted)", color: "var(--color-accent)", border: "none", cursor: "pointer" }}
          >
            <Bell size={12} /> Set Alert
          </button>
          <button
            id={`delete-crypto-${holding.id}`}
            onClick={() => { if (confirm(`Remove ${holding.name}?`)) deleteHolding(holding.id); }}
            style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 600, padding: "0.375rem 0.75rem", borderRadius: "var(--radius-sm)", background: "transparent", color: "var(--color-loss)", opacity: 0.7, border: "none", cursor: "pointer" }}
          >
            Remove
          </button>
        </div>
      </motion.div>

      {showAlertModal && <AlertModal holding={holding} onClose={() => setShowAlertModal(false)} />}
    </>
  );
}

// ─── Price Alerts List ──────────────────────────────────────────────────────

function AlertsList() {
  const { data: alerts, isLoading } = usePriceAlerts();
  const { mutate: deleteAlert } = useDeletePriceAlert();

  if (isLoading || !alerts || alerts.length === 0) return null;

  return (
    <section>
      <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "1rem" }}>Price Alerts</h2>
      <div className="glass-card" style={{ padding: "0.5rem" }}>
        {alerts.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 0.875rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-text-primary)" }}>
              {a.symbol} {a.direction === "ABOVE" ? "≥" : "≤"} <span className="num">{formatCurrency(a.targetPrice, a.currency)}</span>
            </span>
            <button onClick={() => deleteAlert(a.id)} style={{ fontSize: "0.75rem", color: "var(--color-loss)", opacity: 0.7, background: "transparent", border: "none", cursor: "pointer" }}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CryptoPage() {
  const { data: holdings, isLoading, error } = useCryptoHoldings();
  const { data: summary } = useCryptoSummary();
  const [showAddModal, setShowAddModal] = useState(false);

  // Server-computed and currency-converted (see useCryptoSummary) — holdings
  // can be priced in different currencies, so don't sum raw values here.

  const totalGain = summary ? summary.totalValue - summary.totalCost : 0;
  const isGainPositive = totalGain >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>Crypto</h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>CoinGecko · live prices · read-only wallet tracking</p>
        </div>
        <button id="open-add-crypto" onClick={() => setShowAddModal(true)} className="btn-accent">+ Add Holding</button>
      </motion.div>

      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Current Value</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>{formatCurrency(summary.totalValue, summary.currency)}</div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>{summary.count} coin{summary.count !== 1 ? "s" : ""}</p>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Cost Basis</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>{formatCurrency(summary.totalCost, summary.currency)}</div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.375rem" }}>total invested</p>
          </div>
          <div className="glass-card" style={{ padding: "1.5rem" }}>
            <p style={labelStyle}>Total P&amp;L</p>
            <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: isGainPositive ? "var(--color-gain)" : "var(--color-loss)" }}>{formatCurrency(totalGain, summary.currency)}</div>
            <p style={{ fontSize: "0.75rem", marginTop: "0.375rem", color: isGainPositive ? "var(--color-gain)" : "var(--color-loss)" }}>
              {formatPct(summary.totalCost > 0 ? (totalGain / summary.totalCost) * 100 : null)}
            </p>
          </div>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "1rem" }}>Your Holdings</h2>

        {isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {[...Array(3)].map((_, i) => <div key={i} className="glass-card" style={{ height: 220, animation: "pulse 1.5s ease-in-out infinite" }} />)}
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
              <Bitcoin size={36} color="var(--color-text-muted)" />
            </div>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.375rem" }}>No crypto yet</h3>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
              Add BTC, ETH, SOL, or search CoinGecko's full coin list to start tracking live P&amp;L.
            </p>
            <button onClick={() => setShowAddModal(true)} className="btn-accent">Add Your First Coin</button>
          </div>
        )}

        {holdings && holdings.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
            {holdings.map((h, i) => <HoldingCard key={h.id} holding={h} index={i} />)}
          </div>
        )}
      </section>

      <AlertsList />

      <AddHoldingModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
