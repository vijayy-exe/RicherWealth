import type { ResultFormat } from "./types";

export function formatCurrency(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(2)}Cr`;
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(2)}L`;
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatResultValue(value: number, format: ResultFormat): string {
  switch (format) {
    case "currency": return formatCurrency(value);
    case "percent": return `${value.toFixed(2)}%`;
    case "years": return `${value.toFixed(1)} yr${Math.abs(value) === 1 ? "" : "s"}`;
    case "months": return value < 12 ? `${value.toFixed(0)} mo` : `${(value / 12).toFixed(1)} yrs`;
    case "number": return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    default: return String(value);
  }
}
