"use client";

import { useState, useCallback, useMemo, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgGridReact } from "ag-grid-react";
import { ClientSideRowModelModule, type ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

import { Modal } from "@/components/ui/Modal";
import { AssetTypeSelector, ASSET_TYPE_META, ASSET_CATEGORIES } from "@/components/forms/AssetTypeSelector";
import { AssetForm } from "@/components/forms/AssetForm";
import { useAssets, useAssetsSummary, useCreateAsset, useDeleteAsset, type AssetRow, type AssetsPortfolioSummary } from "@/hooks/useAssets";
import { useRevaluations, useAddRevaluation } from "@/hooks/useRealEstate";
import type { AssetType } from "@richer/shared-types";
import { ExportButton } from "@/components/ExportButton";
import { Gem } from "lucide-react";

const REVALUABLE_TYPES = new Set(["COLLECTIBLE", "NFT"]);

// ─── Tab categories ───────────────────────────────────────────────────────────
const TABS = [
  { label: "All Assets", types: null as null | string[] },
  { label: "Investments", types: ["STOCK", "ETF", "MUTUAL_FUND", "BOND", "CRYPTO", "P2P_LENDING", "REIT"] },
  { label: "Real Estate", types: ["REAL_ESTATE"] },
  { label: "Retirement", types: ["RETIREMENT_ACCOUNT"] },
  { label: "Insurance", types: ["INSURANCE"] },
  { label: "Business", types: ["BUSINESS_EQUITY", "PRIVATE_EQUITY", "ANGEL_INVESTMENT"] },
  { label: "Cash & FD", types: ["CASH", "FIXED_DEPOSIT"] },
  { label: "Commodities", types: ["GOLD", "SILVER", "COMMODITY"] },
  { label: "Collectibles", types: ["VEHICLE", "COLLECTIBLE", "NFT"] },
];

// ─── AG Grid column definitions ───────────────────────────────────────────────
const columnDefs: ColDef<AssetRow>[] = [
  {
    field: "name",
    headerName: "Asset Name",
    flex: 2,
    minWidth: 180,
    cellRenderer: (params: { data: AssetRow }) => {
      const meta = ASSET_TYPE_META[params.data.type];
      const Icon = meta?.icon ?? Gem;
      const color = meta?.color ?? "#5C6880";
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: "100%" }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: color + "1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={13} strokeWidth={2} color={color} />
          </div>
          <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{params.data.name}</span>
        </div>
      );
    },
  },
  {
    field: "type",
    headerName: "Type",
    width: 160,
    cellRenderer: (params: { data: AssetRow }) => {
      const meta = ASSET_TYPE_META[params.data.type] ?? { label: params.data.type, color: "#5C6880" };
      return (
        <span style={{
          padding: "2px 10px", borderRadius: 20,
          background: (meta.color ?? "#5C6880") + "20",
          color: meta.color ?? "#5C6880",
          fontSize: "0.75rem", fontWeight: 700,
        }}>
          {meta.label ?? params.data.type}
        </span>
      );
    },
  },
  {
    field: "currentValue",
    headerName: "Current Value",
    flex: 1,
    minWidth: 140,
    cellRenderer: (params: { data: AssetRow }) => {
      // currentValue may come as a string, number, or Prisma Decimal object
      const raw = params.data.currentValue;
      const val = typeof raw === "object" && raw !== null
        ? parseFloat(String((raw as { toNumber?: () => number }).toNumber?.() ?? raw))
        : parseFloat(String(raw ?? "0"));
      const currency = params.data.currencyCode;
      const prefix = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
      if (isNaN(val)) return <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>—</span>;
      return (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-gain)", fontSize: "0.9rem" }}>
          {prefix}{val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </span>
      );
    },
    comparator: (a: string, b: string) => parseFloat(String(a ?? 0)) - parseFloat(String(b ?? 0)),
    sort: "desc" as const,
  },
  {
    field: "currencyCode",
    headerName: "Currency",
    width: 90,
    cellStyle: { color: "var(--color-text-muted)", fontSize: "0.8rem" },
  },
  {
    field: "createdAt",
    headerName: "Added",
    width: 120,
    cellRenderer: (params: { data: AssetRow }) =>
      new Date(params.data.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    cellStyle: { color: "var(--color-text-muted)", fontSize: "0.8rem" },
  },
  {
    headerName: "",
    width: 90,
    sortable: false,
    filter: false,
    cellRenderer: (params: { data: AssetRow; context: { onDelete: (id: string) => void; onViewHistory: (asset: AssetRow) => void } }) => (
      <div style={{ display: "flex", alignItems: "center", gap: 4, height: "100%" }}>
        {REVALUABLE_TYPES.has(params.data.type) && (
          <button
            onClick={() => params.context.onViewHistory(params.data)}
            style={{ background: "transparent", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1rem", padding: "4px", borderRadius: 4 }}
            title="Revaluation history"
          >
            📈
          </button>
        )}
        <button
          onClick={() => params.context.onDelete(params.data.id)}
          style={{
            background: "transparent", border: "none", color: "var(--color-text-muted)",
            cursor: "pointer", fontSize: "1rem", padding: "4px",
            borderRadius: 4,
          }}
          title="Delete"
        >
          🗑
        </button>
      </div>
    ),
  },
];

// ─── Revaluation history modal (collectibles, NFTs) ────────────────────────────

function RevaluationModal({ asset, onClose }: { asset: AssetRow | null; onClose: () => void }) {
  const { data: entries = [], isLoading } = useRevaluations(asset?.id ?? null);
  const addRevaluation = useAddRevaluation(asset?.id ?? "");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  if (!asset) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(value);
    if (isNaN(parsed)) return;
    await addRevaluation.mutateAsync({ value: parsed, currency: asset.currencyCode, ...(note && { note }) });
    setValue("");
    setNote("");
  };

  return (
    <Modal open={!!asset} onClose={onClose} title={`Value History — ${asset.name}`} width={480}>
      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="number" step="0.01" required placeholder={`New value (${asset.currencyCode})`}
          style={{ flex: 1, padding: "0.625rem 0.875rem", background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)", color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none" }}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          style={{ flex: 1, padding: "0.625rem 0.875rem", background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)", color: "var(--color-text-primary)", fontSize: "0.875rem", outline: "none" }}
        />
        <button type="submit" disabled={addRevaluation.isPending} className="btn-accent" style={{ whiteSpace: "nowrap", opacity: addRevaluation.isPending ? 0.5 : 1 }}>
          + Log Value
        </button>
      </form>

      {isLoading ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>No revaluations logged yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((entry) => (
            <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "var(--color-bg-input)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-glass)" }}>
              <div>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                  {new Date(entry.valuedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </p>
                {entry.note && <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>{entry.note}</p>}
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                {new Intl.NumberFormat(undefined, { style: "currency", currency: entry.currency, maximumFractionDigits: 0 }).format(entry.value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyAssets({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "80px 24px", gap: 20, textAlign: "center",
      }}
    >
      <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>📭</div>
      <div>
        <h3 style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "1.125rem", marginBottom: 6 }}>
          No assets yet
        </h3>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 320 }}>
          Add your first asset to start tracking your wealth across all asset classes.
        </p>
      </div>
      <button
        onClick={onAdd}
        style={{
          padding: "0.75rem 2rem",
          background: "var(--color-accent)",
          border: "none", borderRadius: "var(--radius-md)",
          color: "#fff", fontWeight: 700, fontSize: "0.9375rem",
          cursor: "pointer", fontFamily: "var(--font-sans)",
        }}
      >
        + Add Your First Asset
      </button>
    </motion.div>
  );
}

// ─── Total value summary bar ──────────────────────────────────────────────────
// Uses the server-computed, currency-converted summary (useAssetsSummary) —
// NOT a client-side sum of raw currentValue, which is silently wrong for a
// user holding assets in more than one currency (each currentValue is in
// its own currencyCode; naively adding them together mixes units).
function TotalBar({ count, summary }: { count: number; summary: AssetsPortfolioSummary | null | undefined }) {
  return (
    <div style={{
      padding: "12px 20px",
      background: "var(--color-accent-muted)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--color-accent-glow)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
        {count} assets
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--color-text-primary)", fontSize: "1.125rem" }}>
        {summary
          ? new Intl.NumberFormat(undefined, { style: "currency", currency: summary.currency, maximumFractionDigits: 0 }).format(summary.totalValue)
          : "—"}
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AssetsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [modalState, setModalState] = useState<"closed" | "type-select" | "form">("closed");
  const [selectedType, setSelectedType] = useState<AssetType | null>(null);
  const [search, setSearch] = useState("");
  const [historyAsset, setHistoryAsset] = useState<AssetRow | null>(null);

  const { data: assets = [], isLoading } = useAssets();
  const { data: summary } = useAssetsSummary();
  const createAsset = useCreateAsset();
  const deleteAsset = useDeleteAsset();

  const filteredAssets = useMemo(() => {
    let rows = assets;
    const tab = TABS[activeTab];
    if (tab?.types) rows = rows.filter((a) => tab.types!.includes(a.type));
    if (search) rows = rows.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.type.toLowerCase().includes(search.toLowerCase()));
    return rows;
  }, [assets, activeTab, search]);

  const handleTypeSelect = (type: AssetType) => {
    setSelectedType(type);
    setModalState("form");
  };

  const handleSave = async (data: {
    name: string; type: string; currentValue: number;
    currencyCode: string; notes?: string | undefined; details: Record<string, unknown>;
  }) => {
    await createAsset.mutateAsync({
      name: data.name,
      type: data.type,
      currentValue: String(data.currentValue),
      currencyCode: data.currencyCode,
      notes: data.notes ?? null,
      details: data.details,
    });
    setModalState("closed");
    setSelectedType(null);
  };

  const handleDelete = useCallback((id: string) => {
    if (confirm("Delete this asset? This cannot be undone.")) {
      void deleteAsset.mutate(id);
    }
  }, [deleteAsset]);

  const gridContext = useMemo(() => ({ onDelete: handleDelete, onViewHistory: setHistoryAsset }), [handleDelete]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>
            Assets
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
            Track everything you own across all asset classes
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ExportButton dataset="assets" />
          <button
            onClick={() => setModalState("type-select")}
            style={{
              padding: "0.75rem 1.5rem",
              background: "var(--color-accent)",
              border: "none", borderRadius: "var(--radius-md)",
              color: "#fff", fontWeight: 700, fontSize: "0.9375rem",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            + Add Asset
          </button>
        </div>
      </div>

      {/* Total bar */}
      {assets.length > 0 && <TotalBar count={assets.length} summary={summary} />}

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
        {TABS.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(i)}
            style={{
              padding: "6px 14px",
              background: activeTab === i ? "var(--color-accent)" : "var(--color-bg-card)",
              border: `1px solid ${activeTab === i ? "var(--color-accent)" : "var(--color-border-glass)"}`,
              borderRadius: "var(--radius-full)",
              color: activeTab === i ? "#fff" : "var(--color-text-secondary)",
              fontSize: "0.8125rem", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              fontFamily: "var(--font-sans)",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            {tab.types && (
              <span style={{ marginLeft: 6, opacity: 0.7, fontSize: "0.7rem" }}>
                {assets.filter((a) => tab.types!.includes(a.type)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search assets by name or type…"
        style={{
          width: "100%",
          padding: "0.625rem 1rem",
          background: "var(--color-bg-input)",
          border: "1px solid var(--color-border-glass)",
          borderRadius: "var(--radius-md)",
          color: "var(--color-text-primary)",
          fontSize: "0.875rem",
          fontFamily: "var(--font-sans)",
          outline: "none",
        }}
      />

      {/* Grid or empty state */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>Loading assets…</div>
      ) : filteredAssets.length === 0 ? (
        <EmptyAssets onAdd={() => setModalState("type-select")} />
      ) : (
        <div
          className="ag-theme-quartz-dark"
          style={{ height: Math.min(600, 56 + filteredAssets.length * 52), width: "100%", borderRadius: "var(--radius-lg)", overflow: "hidden" }}
        >
          <AgGridReact
            modules={[ClientSideRowModelModule]}
            theme="legacy"
            rowData={filteredAssets}
            columnDefs={columnDefs}
            rowHeight={52}
            headerHeight={44}
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            context={gridContext}
          />
        </div>
      )}

      {/* Add Asset Modal */}
      <Modal
        open={modalState !== "closed"}
        onClose={() => { setModalState("closed"); setSelectedType(null); }}
        width={modalState === "type-select" ? 720 : 620}
      >
        <AnimatePresence mode="wait">
          {modalState === "type-select" ? (
            <motion.div key="selector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AssetTypeSelector onSelect={handleTypeSelect} />
            </motion.div>
          ) : selectedType ? (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AssetForm
                type={selectedType}
                onSuccess={(data) => { void handleSave(data); }}
                onBack={() => setModalState("type-select")}
                isLoading={createAsset.isPending}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Modal>

      <RevaluationModal asset={historyAsset} onClose={() => setHistoryAsset(null)} />
    </div>
  );
}
