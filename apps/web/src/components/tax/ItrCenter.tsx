"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle2, AlertTriangle, XCircle, Loader2, Trash2, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  useItrDocuments, useItrDocument, useItrDiscrepancies, useItrTrend,
  useUploadItrDocument, useConfirmItrDocument, useDeleteItrDocument,
} from "@/hooks/useItr";
import type { ParsedItrData, FieldWithConfidence, ItrDocumentDto } from "@richer/shared-types";

const cardStyle: React.CSSProperties = {
  background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)", padding: "0.75rem 1rem",
};
const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-input)", color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)", borderRadius: "var(--radius-md)",
  padding: "0.5rem 0.75rem", fontSize: "0.875rem", width: "100%",
};
const labelStyle: React.CSSProperties = { fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: "0.25rem", display: "block" };
const buttonStyle: React.CSSProperties = {
  background: "var(--color-bg-input)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)", padding: "0.6rem 1rem", fontWeight: 600, fontSize: "0.8125rem", cursor: "pointer",
};

const STATUS_META: Record<ItrDocumentDto["extractionStatus"], { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "Pending", color: "var(--color-text-muted)", icon: <Loader2 size={14} /> },
  PROCESSING: { label: "Extracting…", color: "var(--color-warning)", icon: <Loader2 size={14} style={{ animation: "itr-spin 0.8s linear infinite" }} /> },
  EXTRACTED_AWAITING_REVIEW: { label: "Needs Review", color: "var(--color-warning)", icon: <AlertTriangle size={14} /> },
  CONFIRMED: { label: "Confirmed", color: "var(--color-gain)", icon: <CheckCircle2 size={14} /> },
  FAILED: { label: "Failed", color: "var(--color-loss)", icon: <XCircle size={14} /> },
};

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function NumField({ label, field, onChange }: { label: string; field: FieldWithConfidence<number>; onChange: (f: FieldWithConfidence<number>) => void }) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {field.needsReview && <span style={{ color: "var(--color-warning)", marginLeft: 6 }}>· needs review</span>}
      </label>
      <input
        type="number"
        value={field.value ?? ""}
        placeholder={field.value === null ? "not detected — enter manually" : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          onChange({ value: raw === "" ? null : Number(raw), confidence: 1, needsReview: raw === "" });
        }}
        style={{ ...inputStyle, borderColor: field.needsReview ? "var(--color-warning)" : "var(--color-border-glass)" }}
      />
    </div>
  );
}

function ReviewScreen({ doc, onDone }: { doc: ItrDocumentDto; onDone: () => void }) {
  const [data, setData] = useState<ParsedItrData>(doc.parsedData!);
  const confirm = useConfirmItrDocument();

  const setDeduction = (code: string, f: FieldWithConfidence<number>) =>
    setData((d) => ({ ...d, deductions: { ...d.deductions, [code]: f } }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
        Extracted via {doc.extractionMethod === "OCR" ? "OCR (scanned document)" : "PDF text"} · overall confidence {doc.confidenceScore !== null ? `${Math.round(doc.confidenceScore * 100)}%` : "—"}.
        Review every field below — nothing is saved until you confirm.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        <NumField label="Gross Total Income" field={data.grossTotalIncome} onChange={(f) => setData((d) => ({ ...d, grossTotalIncome: f }))} />
        <NumField label="Total Tax Paid" field={data.totalTaxPaid} onChange={(f) => setData((d) => ({ ...d, totalTaxPaid: f }))} />
        <NumField label="Salary Income" field={data.incomeByHead.salary} onChange={(f) => setData((d) => ({ ...d, incomeByHead: { ...d.incomeByHead, salary: f } }))} />
        <NumField label="House Property Income" field={data.incomeByHead.houseProperty} onChange={(f) => setData((d) => ({ ...d, incomeByHead: { ...d.incomeByHead, houseProperty: f } }))} />
        <NumField label="Business Income" field={data.incomeByHead.business} onChange={(f) => setData((d) => ({ ...d, incomeByHead: { ...d.incomeByHead, business: f } }))} />
        <NumField label="Other Sources Income" field={data.incomeByHead.otherSources} onChange={(f) => setData((d) => ({ ...d, incomeByHead: { ...d.incomeByHead, otherSources: f } }))} />
        <NumField label="Short-Term Capital Gains" field={data.capitalGainsSchedule.stcg} onChange={(f) => setData((d) => ({ ...d, capitalGainsSchedule: { ...d.capitalGainsSchedule, stcg: f } }))} />
        <NumField label="Long-Term Capital Gains" field={data.capitalGainsSchedule.ltcg} onChange={(f) => setData((d) => ({ ...d, capitalGainsSchedule: { ...d.capitalGainsSchedule, ltcg: f } }))} />
      </div>

      <div>
        <div style={{ ...labelStyle, marginBottom: "0.5rem" }}>Deductions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
          {Object.entries(data.deductions).map(([code, f]) => (
            <NumField key={code} label={code.replace(/_/g, " ")} field={f} onChange={(nf) => setDeduction(code, nf)} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <button style={buttonStyle} onClick={onDone}>Cancel</button>
        <button
          className="btn-accent"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate({ id: doc.id, correctedData: data }, { onSuccess: onDone })}
        >
          {confirm.isPending ? "Confirming…" : "Confirm & Save"}
        </button>
      </div>
      {confirm.isError && <p style={{ color: "var(--color-loss)", fontSize: "0.8125rem" }}>Couldn&apos;t confirm — try again.</p>}
    </div>
  );
}

function DiscrepancyPanel({ documentId }: { documentId: string }) {
  const { data, isLoading, isError } = useItrDiscrepancies(documentId);
  if (isLoading) return <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Comparing against your tracked data…</p>;
  if (isError) return <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Couldn&apos;t compute discrepancies for this document.</p>;
  if (!data || data.lines.length === 0) {
    return <p style={{ fontSize: "0.8125rem", color: "var(--color-gain)" }}>No discrepancies — this ITR matches what RicherWealth has tracked for {data?.financialYear ?? "this year"}.</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Comparing ITR figures against your tracked data for FY {data.financialYear} — informational only, nothing is auto-corrected.</p>
      {data.lines.map((l) => (
        <div key={l.field} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.875rem" }}>
              {l.label}
              {l.itrFieldNeedsReview && <span style={{ color: "var(--color-warning)", fontSize: "0.75rem", marginLeft: 6 }}>(low-confidence ITR value)</span>}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              ITR: {data.currency} {fmt(l.itrValue)} · Tracked: {data.currency} {fmt(l.trackedValue)}
            </div>
          </div>
          <div className="num" style={{ fontWeight: 800, color: l.delta > 0 ? "var(--color-warning)" : "var(--color-loss)" }}>
            {l.delta > 0 ? "+" : ""}{data.currency} {fmt(l.delta)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendPanel() {
  const { data } = useItrTrend();
  if (!data || data.length < 2) return null;
  const points = data.map((p) => ({ year: p.assessmentYear, "Gross Total Income": p.grossTotalIncome, "Total Tax Paid": p.totalTaxPaid }));
  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <TrendingUp size={14} color="var(--color-text-muted)" />
        <span style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Year-over-Year Trend</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-glass)" />
          <XAxis dataKey="year" stroke="var(--color-text-muted)" fontSize={12} />
          <YAxis stroke="var(--color-text-muted)" fontSize={12} />
          <Tooltip contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-glass)" }} />
          <Legend />
          <Line type="monotone" dataKey="Gross Total Income" stroke="var(--color-accent)" strokeWidth={2} />
          <Line type="monotone" dataKey="Total Tax Paid" stroke="var(--color-loss)" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DocumentRow({ doc, onSelect }: { doc: ItrDocumentDto; onSelect: () => void }) {
  const del = useDeleteItrDocument();
  const meta = STATUS_META[doc.extractionStatus];
  const clickable = doc.extractionStatus === "EXTRACTED_AWAITING_REVIEW" || doc.extractionStatus === "CONFIRMED";
  return (
    <div style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: clickable ? "pointer" : "default" }} onClick={clickable ? onSelect : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
        <FileText size={16} color="var(--color-text-muted)" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: "0.875rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.originalFilename}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>AY {doc.assessmentYear}{doc.errorMessage ? ` · ${doc.errorMessage}` : ""}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 700, color: meta.color }}>
          {meta.icon}{meta.label}
        </span>
        <button
          aria-label="Delete"
          onClick={(e) => { e.stopPropagation(); del.mutate(doc.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 4 }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export function ItrCenter() {
  const documents = useItrDocuments();
  const upload = useUploadItrDocument();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assessmentYear, setAssessmentYear] = useState("2025-26");
  const selected = useItrDocument(selectedId);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-card" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>ITR Documents</h3>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            value={assessmentYear}
            onChange={(e) => setAssessmentYear(e.target.value)}
            placeholder="2025-26"
            style={{ ...inputStyle, width: 100 }}
          />
          <label style={{ ...buttonStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Upload size={14} />
            {upload.isPending ? "Uploading…" : "Upload ITR"}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              hidden
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file || !/^\d{4}-\d{2}$/.test(assessmentYear)) return;
                upload.mutate({ file, assessmentYear });
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {!/^\d{4}-\d{2}$/.test(assessmentYear) && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-warning)", marginBottom: "0.75rem" }}>Assessment year must look like &quot;2025-26&quot; before you can upload.</p>
      )}
      {upload.isError && <p style={{ fontSize: "0.8125rem", color: "var(--color-loss)", marginBottom: "0.75rem" }}>Upload failed — try again.</p>}

      {documents.isLoading ? (
        <div style={{ height: 60, borderRadius: "var(--radius-md)", background: "var(--color-bg-input)", opacity: 0.6 }} />
      ) : !documents.data || documents.data.length === 0 ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>No ITR documents uploaded yet. PDF or scanned image (JPG/PNG) — extraction can take a few seconds, especially for scans.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {documents.data.map((d) => <DocumentRow key={d.id} doc={d} onSelect={() => setSelectedId(d.id)} />)}
        </div>
      )}

      <TrendPanel />

      <AnimatePresence>
        {selectedId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", marginTop: "1.25rem", borderTop: "1px solid var(--color-border-glass)", paddingTop: "1.25rem" }}
          >
            {selected.isLoading || !selected.data ? (
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>Loading…</p>
            ) : selected.data.extractionStatus === "PROCESSING" || selected.data.extractionStatus === "PENDING" ? (
              <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={16} style={{ animation: "itr-spin 0.8s linear infinite" }} /> Extracting — this can take a few seconds, longer for scanned documents (OCR).
              </p>
            ) : selected.data.extractionStatus === "FAILED" ? (
              <p style={{ fontSize: "0.875rem", color: "var(--color-loss)" }}>Extraction failed: {selected.data.errorMessage}</p>
            ) : (
              <>
                <ReviewScreen doc={selected.data} onDone={() => setSelectedId(null)} />
                <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--color-border-glass)", paddingTop: "1.25rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>Discrepancies vs. Tracked Data</div>
                  <DiscrepancyPanel documentId={selected.data.id} />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes itr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </motion.div>
  );
}
