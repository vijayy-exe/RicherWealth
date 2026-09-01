"use client";

import { motion } from "framer-motion";

interface CurrencyExposureItem {
  currency: string;
  nativeValue: number;
  valueInBase: number;
  percentage: number;
}

interface CurrencyExposureWidgetProps {
  data: CurrencyExposureItem[];
  baseCurrency: string;
}

const PALETTE = ["#3D83FF", "#00D97E", "#FFB547", "#FF4D6D", "#A78BFA", "#38BDF8"];

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥",
};

function formatNative(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  if (currency === "INR") {
    if (value >= 10_000_000) return `${symbol}${(value / 10_000_000).toFixed(2)}Cr`;
    if (value >= 100_000) return `${symbol}${(value / 100_000).toFixed(2)}L`;
  }
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function CurrencyExposureWidget({ data, baseCurrency }: CurrencyExposureWidgetProps) {
  if (data.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.35 }}
      className="glass-card"
      style={{ padding: "1.5rem" }}
    >
      <h3
        style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: "1.5rem",
        }}
      >
        Currency Exposure
      </h3>

      {/* Stacked bar */}
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginBottom: "1.25rem" }}>
        {data.map((item, i) => (
          <div
            key={item.currency}
            title={`${item.currency} — ${item.percentage.toFixed(1)}%`}
            style={{ width: `${item.percentage}%`, background: PALETTE[i % PALETTE.length] }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {data.map((item, i) => (
          <div key={item.currency} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
              <span style={{ fontWeight: 700, color: "var(--color-text-primary)", fontSize: "0.875rem" }}>{item.currency}</span>
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}>
                {formatNative(item.nativeValue, item.currency)}
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-accent)", fontSize: "0.875rem" }}>
                {item.percentage.toFixed(1)}%
              </p>
              {item.currency !== baseCurrency && (
                <p style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
                  ≈ {formatNative(item.valueInBase, baseCurrency)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
