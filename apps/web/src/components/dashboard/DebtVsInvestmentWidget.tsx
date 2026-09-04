"use client";

import { motion } from "framer-motion";

interface DebtVsInvestmentWidgetProps {
  debtCostPct: number;
  annualInterestCost: number;
  investmentReturnPct: number;
  debtCostExceedsInvestmentReturns: boolean;
  currency: string;
}

function formatCurrency(value: number, currency: string): string {
  const abs = Math.abs(value);
  if (currency === "INR") {
    if (abs >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${sym}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Foundation for Phase 20's AI CFO insight ("your debt costs more than your
 * investments earn") — this phase just computes and displays the two sides
 * of the comparison; the narrative insight itself is future AI-layer work.
 */
export function DebtVsInvestmentWidget({
  debtCostPct,
  annualInterestCost,
  investmentReturnPct,
  debtCostExceedsInvestmentReturns,
  currency,
}: DebtVsInvestmentWidgetProps) {
  const maxBar = Math.max(Math.abs(debtCostPct), Math.abs(investmentReturnPct), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <h3 style={{
        fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        color: "var(--color-text-muted)", marginBottom: "1.25rem",
      }}>
        Debt Cost vs. Investment Return
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>Cost of Debt</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-loss)" }}>{debtCostPct.toFixed(2)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--color-bg-input, rgba(255,255,255,0.06))", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (debtCostPct / maxBar) * 100)}%`, background: "var(--color-loss)", borderRadius: 6 }} />
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>Investment Return (1yr, asset growth)</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-gain)" }}>
              {investmentReturnPct >= 0 ? "+" : ""}{investmentReturnPct.toFixed(2)}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--color-bg-input, rgba(255,255,255,0.06))", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (Math.abs(investmentReturnPct) / maxBar) * 100)}%`, background: "var(--color-gain)", borderRadius: 6 }} />
          </div>
        </div>
      </div>

      <div style={{
        padding: "0.875rem 1rem", borderRadius: "var(--radius-md)",
        background: debtCostExceedsInvestmentReturns ? "var(--color-loss-muted, rgba(255,77,109,0.1))" : "var(--color-gain-muted, rgba(0,217,126,0.1))",
        fontSize: "0.8125rem",
        color: debtCostExceedsInvestmentReturns ? "var(--color-loss)" : "var(--color-gain)",
      }}>
        {annualInterestCost > 0 ? (
          debtCostExceedsInvestmentReturns ? (
            <>⚠️ Your debt is costing you more ({debtCostPct.toFixed(1)}%) than your investments are earning ({investmentReturnPct.toFixed(1)}%) — paying it down may beat investing right now. Est. {formatCurrency(annualInterestCost, currency)}/yr in interest.</>
          ) : (
            <>✓ Your investments are outpacing your cost of debt. Est. {formatCurrency(annualInterestCost, currency)}/yr in interest.</>
          )
        ) : (
          <>No outstanding debt — nothing to compare.</>
        )}
      </div>
    </motion.div>
  );
}
