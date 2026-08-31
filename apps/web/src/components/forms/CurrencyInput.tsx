"use client";

import { forwardRef, useState } from "react";
import { inputStyle } from "./FormField";

const CURRENCIES = [
  { code: "INR", symbol: "₹" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "SGD", symbol: "S$" },
  { code: "AED", symbol: "د.إ" },
  { code: "JPY", symbol: "¥" },
  { code: "CAD", symbol: "CA$" },
  { code: "AUD", symbol: "A$" },
];

interface CurrencyInputProps {
  value: string | number;
  onChange: (value: number) => void;
  currency?: string;
  onCurrencyChange?: (currency: string) => void;
  placeholder?: string;
  error?: boolean;
  id?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, currency = "INR", onCurrencyChange, placeholder, error, id }, ref) => {
    const [displayValue, setDisplayValue] = useState(value !== "" && value !== undefined ? String(value) : "");
    const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

    const handleChange = (raw: string) => {
      const cleaned = raw.replace(/[^0-9.]/g, "");
      setDisplayValue(cleaned);
      const num = parseFloat(cleaned);
      if (!isNaN(num)) onChange(num);
    };

    const handleBlur = () => {
      const num = parseFloat(displayValue.replace(/,/g, ""));
      if (!isNaN(num)) {
        setDisplayValue(num.toLocaleString("en-IN", { maximumFractionDigits: 2 }));
        onChange(num);
      }
    };

    const handleFocus = () => {
      const num = parseFloat(displayValue.replace(/,/g, ""));
      if (!isNaN(num)) setDisplayValue(String(num));
    };

    return (
      <div style={{ display: "flex", gap: 8 }}>
        {onCurrencyChange && (
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            style={{
              padding: "0.625rem 0.5rem",
              background: "var(--color-bg-input)",
              border: "1px solid var(--color-border-glass)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-text-secondary)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              minWidth: 72,
              cursor: "pointer",
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        )}
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: "var(--color-text-muted)", fontSize: "0.9375rem", pointerEvents: "none",
          }}>
            {symbol}
          </span>
          <input
            ref={ref}
            id={id}
            type="text"
            inputMode="decimal"
            placeholder={placeholder ?? "0.00"}
            value={displayValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            onFocus={handleFocus}
            style={{ ...inputStyle(error), paddingLeft: "1.75rem" }}
          />
        </div>
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";
