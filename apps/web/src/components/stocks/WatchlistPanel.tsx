"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useWatchlists, useAddToWatchlist, useRemoveFromWatchlist, useCreateWatchlist, type WatchlistWithItems } from "@/hooks/useStockHoldings";
import type { PriceTickMap } from "@/hooks/useStockPriceTick";

interface WatchlistPanelProps {
  priceTicks: PriceTickMap;
}

function pctColor(pct: number | null): string {
  if (!pct) return "var(--color-text-muted)";
  return pct >= 0 ? "var(--color-gain)" : "var(--color-loss)";
}

function pctLabel(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function WatchlistCard({ watchlist, priceTicks, onRemoveItem }: {
  watchlist: WatchlistWithItems;
  priceTicks: PriceTickMap;
  onRemoveItem: (watchlistId: string, itemId: string) => void;
}) {
  return (
    <div style={{
      background: "var(--color-bg-card)",
      border: "1px solid var(--color-border-glass)",
      borderRadius: "var(--radius-lg)",
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--color-border-glass)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-text-primary)" }}>
          {watchlist.name}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          {watchlist.items.length} tickers
        </span>
      </div>

      {watchlist.items.length === 0 ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>
          No tickers yet — add one below
        </div>
      ) : (
        <div>
          {watchlist.items.map((item) => {
            const tickKey = `${item.exchange}:${item.ticker}`;
            const tick = priceTicks[tickKey];
            const livePrice = tick?.price ?? item.livePrice;
            const dayPct = item.dayChangePct;

            return (
              <div
                key={item.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  transition: "background 0.1s",
                }}
              >
                <div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.875rem", color: "var(--color-text-primary)" }}>
                    {item.ticker}
                  </span>
                  <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                    {item.exchange}
                  </span>
                  {item.isStale && (
                    <span style={{ marginLeft: 6, fontSize: "0.6rem", color: "#F5A623" }}>⚡</span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.875rem", color: "var(--color-text-primary)" }}>
                    {livePrice != null ? `${livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                  </span>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: pctColor(dayPct), minWidth: 56, textAlign: "right" }}>
                    {pctLabel(dayPct)}
                  </span>
                  <button
                    onClick={() => onRemoveItem(watchlist.id, item.id)}
                    style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "0.875rem" }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WatchlistPanel({ priceTicks }: WatchlistPanelProps) {
  const { data: watchlists = [], isLoading } = useWatchlists();
  const removeItem = useRemoveFromWatchlist();
  const addItem = useAddToWatchlist();
  const createWatchlist = useCreateWatchlist();

  const [addInput, setAddInput] = useState({ ticker: "", exchange: "NASDAQ" });
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>("");

  const defaultWatchlistId = selectedWatchlistId || watchlists[0]?.id;

  const handleAdd = () => {
    if (!addInput.ticker || !defaultWatchlistId) return;
    void addItem.mutateAsync({ watchlistId: defaultWatchlistId, ticker: addInput.ticker, exchange: addInput.exchange });
    setAddInput({ ticker: "", exchange: "NASDAQ" });
  };

  if (isLoading) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>Loading watchlists…</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Create watchlist */}
      {watchlists.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: "28px", textAlign: "center",
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-glass)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>👀</div>
          <h3 style={{ fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>No watchlists yet</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: 16 }}>
            Create a watchlist to track tickers you're watching without holding.
          </p>
          <button
            onClick={() => { void createWatchlist.mutateAsync("My Watchlist"); }}
            style={{
              padding: "0.625rem 1.5rem",
              background: "linear-gradient(135deg, var(--color-accent), #00D97E)",
              border: "none", borderRadius: "var(--radius-md)",
              color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
          >
            + Create Watchlist
          </button>
        </motion.div>
      )}

      {/* Watchlist cards */}
      {watchlists.map((wl) => (
        <WatchlistCard
          key={wl.id}
          watchlist={wl}
          priceTicks={priceTicks}
          onRemoveItem={(wlId, itemId) => { void removeItem.mutateAsync({ watchlistId: wlId, itemId }); }}
        />
      ))}

      {/* Quick add to watchlist */}
      {watchlists.length > 0 && (
        <div style={{
          padding: "16px", background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-lg)",
        }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Add Ticker
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={addInput.ticker}
              onChange={(e) => setAddInput((p) => ({ ...p, ticker: e.target.value.toUpperCase() }))}
              placeholder="TICKER"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              style={{
                flex: 1, minWidth: 80, padding: "8px 12px",
                background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
                borderRadius: "var(--radius-md)", color: "var(--color-text-primary)",
                fontFamily: "var(--font-mono)", fontSize: "0.875rem", outline: "none",
              }}
            />
            <select
              value={addInput.exchange}
              onChange={(e) => setAddInput((p) => ({ ...p, exchange: e.target.value }))}
              style={{
                padding: "8px 10px", background: "var(--color-bg-input)",
                border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
                color: "var(--color-text-primary)", fontSize: "0.8125rem", cursor: "pointer",
              }}
            >
              {["NASDAQ", "NYSE", "NSE", "BSE", "LSE", "HKEX"].map((ex) => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={addItem.isPending || !addInput.ticker}
              style={{
                padding: "8px 16px",
                background: "var(--color-accent)", border: "none",
                borderRadius: "var(--radius-md)", color: "#fff",
                fontWeight: 700, cursor: "pointer", fontSize: "0.8125rem",
              }}
            >
              + Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
