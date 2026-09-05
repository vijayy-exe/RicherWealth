"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, Download, RefreshCw, AlertTriangle, Landmark } from "lucide-react";

import { useCapitalGains, useDividends, useHarvestingCandidates, useBackfillLots, downloadTaxReport } from "@/hooks/useTax";
import { ItrCenter } from "@/components/tax/ItrCenter";

const COUNTRIES = [
  { code: "US", label: "United States", defaultFy: () => String(new Date().getFullYear()) },
  { code: "IN", label: "India", defaultFy: () => {
    const now = new Date();
    const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `${start}-${String(start + 1).slice(2)}`;
  } },
];

function fmtMoney(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function GainLossValue({ value, currency }: { value: number; currency: string }) {
  return (
    <span className="num" style={{ color: value >= 0 ? "var(--color-gain)" : "var(--color-loss)", fontWeight: 800 }}>
      {fmtMoney(value, currency)}
    </span>
  );
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="glass-card" style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{title}</h3>
        {right}
      </div>
      {children}
    </motion.div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", padding: "1rem 0" }}>{text}</p>;
}

function LoadingSkeleton() {
  return <div style={{ height: 80, borderRadius: "var(--radius-md)", background: "var(--color-bg-input)", opacity: 0.6 }} />;
}

const secondaryButtonStyle: React.CSSProperties = {
  background: "var(--color-bg-input)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)",
  padding: "0.6rem 1rem",
  fontWeight: 600,
  fontSize: "0.8125rem",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-input)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-glass)",
  borderRadius: "var(--radius-md)",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
};

export default function TaxCenterPage() {
  const [countryCode, setCountryCode] = useState("US");
  const country = COUNTRIES.find((c) => c.code === countryCode)!;
  const [financialYear, setFinancialYear] = useState(country.defaultFy());

  const capitalGains = useCapitalGains(financialYear, countryCode);
  const dividends = useDividends(financialYear, countryCode);
  const harvesting = useHarvestingCandidates(countryCode);
  const backfill = useBackfillLots();

  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);

  async function handleDownload(format: "csv" | "pdf") {
    setDownloading(format);
    try {
      await downloadTaxReport(financialYear, countryCode, format);
    } finally {
      setDownloading(null);
    }
  }

  const currency = capitalGains.data?.currency ?? (countryCode === "IN" ? "INR" : "USD");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>Tax Center</h1>
          <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
            Capital gains, dividends, and tax-loss harvesting — a simplified reference, not tax advice.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select
            value={countryCode}
            onChange={(e) => {
              const next = e.target.value;
              setCountryCode(next);
              setFinancialYear(COUNTRIES.find((c) => c.code === next)!.defaultFy());
            }}
            style={inputStyle}
          >
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
          <input
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
            placeholder={countryCode === "IN" ? "2026-27" : "2026"}
          />
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{
        display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--color-warning)",
        background: "var(--color-warning-muted)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)",
      }}>
        <AlertTriangle size={14} />
        {`Not tax advice. Simplified reference rates for ${country.label} as of the config's documented date — consult a qualified tax professional before filing.`}
      </motion.div>

      {capitalGains.data?.hasBackfillEstimateData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{
          fontSize: "0.8125rem", color: "var(--color-text-secondary)", background: "var(--color-bg-input)",
          padding: "0.75rem 1rem", borderRadius: "var(--radius-md)",
        }}>
          Some lots in this report are <strong>backfill estimates</strong> — a single synthetic lot approximated from a holding&apos;s average buy price and purchase date, not real per-purchase history. New buys/sells recorded going forward use real lots.
        </motion.div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
        <Section title="Short-Term Capital Gains">
          {capitalGains.isLoading ? <LoadingSkeleton /> : capitalGains.isError ? (
            <EmptyState text="Couldn't load capital gains — try again." />
          ) : !capitalGains.data || capitalGains.data.shortTerm.lines.length === 0 ? (
            <EmptyState text="No short-term disposals recorded for this financial year yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "1.5rem" }}><GainLossValue value={capitalGains.data.shortTerm.net} currency={currency} /></div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                {capitalGains.data.shortTerm.lines.length} disposal(s) · est. tax {fmtMoney(capitalGains.data.shortTerm.estimatedTaxAmount, currency)}
                {capitalGains.data.shortTerm.estimatedRatePct === 0 && capitalGains.data.shortTerm.net > 0 ? " (taxed as ordinary income — not a flat rate)" : ""}
              </div>
            </div>
          )}
        </Section>

        <Section title="Long-Term Capital Gains">
          {capitalGains.isLoading ? <LoadingSkeleton /> : !capitalGains.data || capitalGains.data.longTerm.lines.length === 0 ? (
            <EmptyState text="No long-term disposals recorded for this financial year yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ fontSize: "1.5rem" }}><GainLossValue value={capitalGains.data.longTerm.taxableGain} currency={currency} /></div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                {capitalGains.data.longTerm.lines.length} disposal(s) · exemption applied {fmtMoney(capitalGains.data.longTerm.exemptionApplied, currency)} · est. tax {fmtMoney(capitalGains.data.longTerm.estimatedTaxAmount, currency)}
              </div>
            </div>
          )}
        </Section>

        <Section title="Dividend Income">
          {dividends.isLoading ? <LoadingSkeleton /> : !dividends.data || dividends.data.records.length === 0 ? (
            <EmptyState text="No dividends recorded for this financial year yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div className="num" style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--color-text-primary)" }}>{fmtMoney(dividends.data.totalDividendIncome, currency)}</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
                {dividends.data.records.length} payment(s) · est. tax {fmtMoney(dividends.data.estimatedWithholdingTax, currency)}
              </div>
            </div>
          )}
        </Section>
      </div>

      <Section
        title="Tax-Loss Harvesting"
        right={<TrendingDown size={16} color="var(--color-loss)" />}
      >
        {harvesting.isLoading ? <LoadingSkeleton /> : harvesting.isError ? (
          <EmptyState text="Couldn't load harvesting candidates — try again." />
        ) : !harvesting.data || harvesting.data.length === 0 ? (
          <EmptyState text="No holdings are currently underwater — nothing to harvest right now." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {harvesting.data.map((c) => (
              <div key={c.lot.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0.75rem 1rem", borderRadius: "var(--radius-md)", background: "var(--color-bg-input)",
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{c.lot.displayName} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({c.lot.ticker})</span></div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    Cost basis {fmtMoney(c.costBasisTotal, currency)} → now worth {fmtMoney(c.currentValue, currency)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ color: "var(--color-loss)", fontWeight: 800 }}>{fmtMoney(c.unrealizedLoss, currency)}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>~{fmtMoney(c.estimatedTaxSaving, currency)} potential saving</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <ItrCenter />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card" style={{ padding: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Landmark size={16} color="var(--color-text-muted)" />
          <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
            New here? Backfill a starting tax lot from your existing holdings (a labeled estimate, not real purchase history).
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button onClick={() => backfill.mutate()} disabled={backfill.isPending} style={secondaryButtonStyle}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} style={backfill.isPending ? { animation: "tax-spin 0.8s linear infinite" } : undefined} />
              {backfill.isPending ? "Backfilling…" : "Backfill lots"}
            </span>
          </button>
          <button onClick={() => handleDownload("csv")} disabled={downloading !== null} style={secondaryButtonStyle}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Download size={14} /> {downloading === "csv" ? "Downloading…" : "CSV"}
            </span>
          </button>
          <button onClick={() => handleDownload("pdf")} disabled={downloading !== null} className="btn-accent">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Download size={14} /> {downloading === "pdf" ? "Downloading…" : "PDF Report"}
            </span>
          </button>
        </div>
      </motion.div>

      {backfill.isSuccess && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-gain)" }}>
          Backfilled {backfill.data.created} lot(s) ({backfill.data.skipped} already existed).
        </p>
      )}

      <style jsx>{`
        @keyframes tax-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
