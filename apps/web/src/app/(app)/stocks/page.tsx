"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgGridReact } from "ag-grid-react";
import { ClientSideRowModelModule, type ColDef, type ICellRendererParams } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { useHoldings, useCreateHolding, useDeleteHolding, type HoldingRow } from "@/hooks/useStockHoldings";
import { useStockPriceTick, type PriceTickMap } from "@/hooks/useStockPriceTick";
import { AddHoldingDrawer } from "@/components/stocks/AddHoldingDrawer";
import { WatchlistPanel } from "@/components/stocks/WatchlistPanel";
import { FairValueBadge } from "@/components/stocks/FairValueBadge";
import { StalePriceBadge } from "@/components/stocks/StalePriceBadge";
import { ExportButton } from "@/components/ExportButton";

// ─── Live Price Cell (flashes on WebSocket tick) ──────────────────────────────

function PriceCellRenderer({ data, context }: ICellRendererParams<HoldingRow, number, { ticks: PriceTickMap }>) {
  if (!data) return null;
  const key = `${data.exchange}:${data.ticker}`;
  const tick = context?.ticks?.[key];
  const livePrice = tick?.price ?? data.analytics?.livePrice ?? null;
  const flash = tick?.flash ?? null;

  const bgColor = flash === "up"
    ? "rgba(0, 217, 126, 0.15)"
    : flash === "down"
    ? "rgba(255, 77, 109, 0.15)"
    : "transparent";

  const fgColor = flash === "up"
    ? "#00D97E"
    : flash === "down"
    ? "#FF4D6D"
    : "var(--color-text-primary)";

  if (livePrice === null) {
    return <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>loading…</span>;
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      height: "100%", padding: "0 4px",
      background: bgColor,
      transition: "background 0.6s ease",
      borderRadius: 4,
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.9rem",
        color: fgColor, transition: "color 0.6s ease",
      }}>
        {livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      {flash && (
        <span style={{ fontSize: "0.75rem", color: fgColor }}>
          {flash === "up" ? "▲" : "▼"}
        </span>
      )}
    </div>
  );
}

// ─── Column Definitions ───────────────────────────────────────────────────────

function buildColumnDefs(onDelete: (id: string) => void): ColDef<HoldingRow>[] {
  return [
    {
      headerName: "Stock",
      field: "ticker",
      flex: 1.5,
      minWidth: 160,
      pinned: "left",
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        if (!p.data) return null;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: "var(--color-accent-muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: "0.7rem", color: "var(--color-accent)",
              fontFamily: "var(--font-mono)",
            }}>
              {p.data.ticker.slice(0, 3)}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "0.875rem" }}>
                {p.data.ticker}
                <StalePriceBadge lastSyncAt={p.data.lastSyncAt} />
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>
                {p.data.exchange} · {p.data.quantity} shares
              </div>
            </div>
          </div>
        );
      },
    },
    {
      headerName: "Live Price",
      field: "analytics",
      flex: 1,
      minWidth: 120,
      cellRenderer: PriceCellRenderer,
      comparator: (a, b) => (a?.livePrice ?? 0) - (b?.livePrice ?? 0),
    },
    {
      headerName: "Day Change",
      flex: 1,
      minWidth: 110,
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        const a = p.data?.analytics;
        if (!a) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
        const pct = a.dayChangePct;
        if (pct === null) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
        const color = pct >= 0 ? "var(--color-gain)" : "var(--color-loss)";
        return (
          <span style={{ color, fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
          </span>
        );
      },
    },
    {
      headerName: "Market Value",
      flex: 1,
      minWidth: 130,
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        const a = p.data?.analytics;
        if (!a) return "—";
        return (
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-text-primary)", fontSize: "0.9rem" }}>
            {a.currency === "INR" ? "₹" : "$"}{a.marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        );
      },
      comparator: (_, __, rowA, rowB) => (rowA.data?.analytics?.marketValue ?? 0) - (rowB.data?.analytics?.marketValue ?? 0),
    },
    {
      headerName: "Total Gain",
      flex: 1,
      minWidth: 120,
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        const a = p.data?.analytics;
        if (!a) return "—";
        const color = a.totalGainPct >= 0 ? "var(--color-gain)" : "var(--color-loss)";
        return (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color, fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
              {a.totalGainPct >= 0 ? "+" : ""}{a.totalGainPct.toFixed(1)}%
            </span>
            <span style={{ fontSize: "0.7rem", color, opacity: 0.8 }}>
              {a.totalGainAbs >= 0 ? "+" : ""}{a.totalGainAbs.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "CAGR",
      flex: 0.8,
      minWidth: 90,
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        const cagr = p.data?.analytics?.cagr;
        if (cagr === null || cagr === undefined) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
        const color = cagr >= 0 ? "var(--color-gain)" : "var(--color-loss)";
        return (
          <span style={{ color, fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "0.875rem" }}>
            {cagr >= 0 ? "+" : ""}{cagr.toFixed(1)}%
          </span>
        );
      },
    },
    {
      headerName: "P/E",
      flex: 0.7,
      minWidth: 80,
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        const pe = p.data?.analytics?.pe;
        if (!pe) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
        return <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>{pe.toFixed(1)}×</span>;
      },
    },
    {
      headerName: "Graham",
      flex: 0.8,
      minWidth: 90,
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        const g = p.data?.analytics?.grahamValue;
        if (!g) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
        return <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", fontSize: "0.875rem" }}>{g.toFixed(2)}</span>;
      },
    },
    {
      headerName: "Value",
      flex: 1,
      minWidth: 110,
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => {
        const flag = p.data?.analytics?.fairValueFlag ?? "NO_DATA";
        return <FairValueBadge flag={flag} />;
      },
    },
    {
      headerName: "",
      width: 52,
      sortable: false,
      filter: false,
      pinned: "right",
      cellRenderer: (p: ICellRendererParams<HoldingRow>) => (
        <button
          onClick={() => p.data && onDelete(p.data.id)}
          style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1rem" }}
          title="Delete holding"
        >🗑</button>
      ),
    },
  ];
}

// ─── Summary Banner ───────────────────────────────────────────────────────────

function SummaryBanner({ holdings, priceTicks }: { holdings: HoldingRow[]; priceTicks: PriceTickMap }) {
  const stats = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let bestPct = -Infinity;
    let worstPct = Infinity;
    let bestTicker = "";
    let worstTicker = "";
    let dayPnl = 0;

    for (const h of holdings) {
      const a = h.analytics;
      if (!a) continue;
      const key = `${h.exchange}:${h.ticker}`;
      const tickPrice = priceTicks[key]?.price ?? a.livePrice;
      const mv = tickPrice * h.quantity;
      totalValue += mv;
      totalCost += a.costBasis;

      if (a.totalGainPct > bestPct) { bestPct = a.totalGainPct; bestTicker = h.ticker; }
      if (a.totalGainPct < worstPct) { worstPct = a.totalGainPct; worstTicker = h.ticker; }

      if (a.dayChangeAbs !== null) dayPnl += a.dayChangeAbs * h.quantity;
    }

    const totalGainPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
    return { totalValue, totalCost, totalGainPct, dayPnl, bestTicker, bestPct, worstTicker, worstPct };
  }, [holdings, priceTicks]);

  const cards = [
    { label: "Total Equity Value", value: `₹${stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "var(--color-text-primary)" },
    { label: "Day P&L", value: `${stats.dayPnl >= 0 ? "+" : ""}${stats.dayPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: stats.dayPnl >= 0 ? "var(--color-gain)" : "var(--color-loss)" },
    { label: "Total Gain", value: `${stats.totalGainPct >= 0 ? "+" : ""}${stats.totalGainPct.toFixed(2)}%`, color: stats.totalGainPct >= 0 ? "var(--color-gain)" : "var(--color-loss)" },
    { label: "Best Performer", value: stats.bestTicker || "—", color: "var(--color-gain)" },
    { label: "Worst Performer", value: stats.worstTicker || "—", color: "var(--color-loss)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {cards.map(({ label, value, color }) => (
        <div key={label} style={{
          padding: "14px 16px",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-glass)",
          borderRadius: "var(--radius-lg)",
        }}>
          <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", marginBottom: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</p>
          <p style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "1.1rem", color }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StocksPage() {
  const [activeTab, setActiveTab] = useState<"holdings" | "watchlist">("holdings");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: holdings = [], isLoading } = useHoldings();
  const createHolding = useCreateHolding();
  const deleteHolding = useDeleteHolding();
  const priceTicks = useStockPriceTick();

  const handleDelete = useCallback((id: string) => {
    if (confirm("Delete this holding? This cannot be undone.")) {
      void deleteHolding.mutate(id);
    }
  }, [deleteHolding]);

  const columnDefs = useMemo(() => buildColumnDefs(handleDelete), [handleDelete]);
  const gridContext = useMemo(() => ({ ticks: priceTicks }), [priceTicks]);

  const tabs = [
    { id: "holdings", label: `Holdings (${holdings.length})` },
    { id: "watchlist", label: "Watchlist" },
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Stocks
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            Live holdings synced every 15 minutes · Prices from Alpha Vantage → Finnhub → Twelve Data
          </p>
        </div>
        {activeTab === "holdings" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ExportButton dataset="stocks" />
            <button
              onClick={() => setDrawerOpen(true)}
              style={{
                padding: "0.75rem 1.5rem",
                background: "var(--color-accent)",
                border: "none", borderRadius: "var(--radius-md)",
                color: "#fff", fontWeight: 700, fontSize: "0.9375rem",
                cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
            >
              + Add Holding
            </button>
          </div>
        )}
      </div>

      {/* Summary banner (holdings tab only) */}
      {activeTab === "holdings" && holdings.length > 0 && (
        <SummaryBanner holdings={holdings} priceTicks={priceTicks} />
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "6px 16px",
              background: activeTab === tab.id ? "var(--color-accent)" : "var(--color-bg-card)",
              border: `1px solid ${activeTab === tab.id ? "var(--color-accent)" : "var(--color-border-glass)"}`,
              borderRadius: "var(--radius-full)",
              color: activeTab === tab.id ? "#fff" : "var(--color-text-secondary)",
              fontSize: "0.8125rem", fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--font-sans)",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === "holdings" ? (
          <motion.div key="holdings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: 80, color: "var(--color-text-muted)" }}>
                Loading holdings…
              </div>
            ) : holdings.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                style={{
                  textAlign: "center", padding: "80px 24px",
                  background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)",
                  borderRadius: "var(--radius-xl)",
                }}
              >
                <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>📈</div>
                <h3 style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "1.25rem", marginBottom: 8 }}>
                  No holdings yet
                </h3>
                <p style={{ color: "var(--color-text-muted)", marginBottom: 24, maxWidth: 320, margin: "0 auto 24px" }}>
                  Add your first stock holding. Live prices and analytics will appear automatically.
                </p>
                <button
                  onClick={() => setDrawerOpen(true)}
                  style={{
                    padding: "0.75rem 2rem",
                    background: "var(--color-accent)",
                    border: "none", borderRadius: "var(--radius-md)",
                    color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)",
                  }}
                >
                  + Add Your First Holding
                </button>
              </motion.div>
            ) : (
              <div
                className="ag-theme-quartz-dark"
                style={{
                  height: Math.min(700, 56 + holdings.length * 60),
                  width: "100%",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                }}
              >
                <AgGridReact<HoldingRow>
                  modules={[ClientSideRowModelModule]}
                  theme="legacy"
                  rowData={holdings}
                  columnDefs={columnDefs}
                  rowHeight={60}
                  headerHeight={44}
                  defaultColDef={{ resizable: true, sortable: true }}
                  context={gridContext}
                  getRowId={(p) => p.data.id}
                />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="watchlist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <WatchlistPanel priceTicks={priceTicks} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Holding Drawer */}
      <AddHoldingDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={async (dto) => {
          await createHolding.mutateAsync(dto);
          setDrawerOpen(false);
        }}
        isLoading={createHolding.isPending}
      />
    </div>
  );
}
