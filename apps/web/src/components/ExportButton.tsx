"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportTable, type ExportDataset } from "@/hooks/useReports";

/**
 * The one reusable "Export" action for AG Grid pages — drop this into any
 * page's header next to its existing actions. Same dropdown (xlsx/csv) and
 * loading/error states everywhere, so a user learns the pattern once.
 */
export function ExportButton({ dataset }: { dataset: ExportDataset }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function handleExport(format: "xlsx" | "csv") {
    setBusy(true);
    setError(null);
    try {
      await exportTable(dataset, format);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: "var(--radius-full)",
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: "var(--color-text-secondary)",
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-glass)",
          cursor: busy ? "default" : "pointer",
        }}
      >
        <Download size={14} />
        {busy ? "Exporting…" : "Export"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 160,
            padding: 6,
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border-glass)",
            background: "var(--color-bg-elevated)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <button type="button" onClick={() => void handleExport("xlsx")} style={menuItemStyle}>
            <FileSpreadsheet size={14} /> Excel (.xlsx)
          </button>
          <button type="button" onClick={() => void handleExport("csv")} style={menuItemStyle}>
            <FileText size={14} /> CSV
          </button>
        </div>
      )}

      {error && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, fontSize: "0.75rem", color: "#FF5C5C", whiteSpace: "nowrap" }}>
          {error}
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: "var(--radius-md)",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "var(--color-text-primary)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
};
