"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, TrendingUp, Landmark, Sparkles, Download, Bot } from "lucide-react";
import { downloadReport, type ReportType } from "@/hooks/useReports";
import { useLatestAiReport, useGenerateAiReport, type AiReportType } from "@/hooks/useAiReports";

const REPORTS: Array<{ type: ReportType; label: string; description: string; icon: React.ReactNode }> = [
  { type: "net-worth-statement", label: "Net Worth Statement", description: "Total net worth, asset allocation, currency exposure, and financial health.", icon: <TrendingUp size={20} /> },
  { type: "portfolio-analytics", label: "Portfolio Analytics Summary", description: "Diversification score, Sharpe/Sortino, beta, volatility, and drawdown.", icon: <Sparkles size={20} /> },
  { type: "tax-report", label: "Tax Report", description: "Capital gains, dividend income, and estimated tax for a financial year.", icon: <Landmark size={20} /> },
  { type: "financial-snapshot", label: "Financial Snapshot", description: "A one-page composite of net worth, top holdings, and portfolio health.", icon: <FileText size={20} /> },
];

const AI_REPORT_TYPES: Array<{ type: AiReportType; label: string }> = [
  { type: "DAILY", label: "Daily" },
  { type: "WEEKLY", label: "Weekly" },
  { type: "MONTHLY", label: "Monthly" },
  { type: "YEARLY", label: "Yearly" },
];

function AiReportCard({ type, label }: { type: AiReportType; label: string }) {
  const { data: report, isLoading } = useLatestAiReport(type);
  const generate = useGenerateAiReport();

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border-glass)",
        background: "var(--color-bg-card)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--color-text-primary)" }}>{label}</span>
        <button
          type="button"
          onClick={() => generate.mutate(type)}
          disabled={generate.isPending}
          style={{
            fontSize: "0.6875rem",
            color: "var(--color-accent)",
            background: "none",
            border: "none",
            cursor: generate.isPending ? "default" : "pointer",
            padding: 0,
          }}
        >
          {generate.isPending ? "Generating…" : "Generate now"}
        </button>
      </div>

      {isLoading ? (
        <div style={{ height: 12, width: "80%", background: "var(--color-bg-input)", borderRadius: 6 }} />
      ) : report ? (
        <>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{report.narrative}</p>
          <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
            {report.isLLMGenerated ? `AI-written (${report.modelUsed})` : "Computed summary (AI narration unavailable)"}
          </span>
        </>
      ) : (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
          No {label.toLowerCase()} report yet — click Generate now, or wait for the next scheduled run.
        </p>
      )}
    </div>
  );
}

function AiInsightsSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Bot size={16} color="var(--color-accent)" />
        <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>AI Insights</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {AI_REPORT_TYPES.map(({ type, label }) => (
          <AiReportCard key={type} type={type} label={label} />
        ))}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [downloading, setDownloading] = useState<ReportType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(type: ReportType) {
    setDownloading(type);
    setError(null);
    try {
      await downloadReport(type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: 4 }}>Reports</h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
          Institutional-style PDF statements, generated on demand from your live data.
        </p>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "rgba(255,92,92,0.1)", border: "1px solid rgba(255,92,92,0.3)", color: "#FF5C5C", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {REPORTS.map((report) => (
          <motion.div
            key={report.type}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              padding: 20,
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-glass)",
              background: "var(--color-bg-card)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-accent)" }}>
              {report.icon}
              <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--color-text-primary)" }}>{report.label}</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", flex: 1 }}>{report.description}</p>
            <button
              onClick={() => void handleDownload(report.type)}
              disabled={downloading !== null}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-accent-muted)",
                border: "1px solid var(--color-accent-glow)",
                color: "var(--color-accent)",
                fontWeight: 600,
                fontSize: "0.8125rem",
                cursor: downloading !== null ? "default" : "pointer",
              }}
            >
              <Download size={14} />
              {downloading === report.type ? "Generating…" : "Download PDF"}
            </button>
          </motion.div>
        ))}
      </div>

      <AiInsightsSection />
    </div>
  );
}
