"use client";

import type { CalculatorFieldConfig } from "@/lib/calculators/types";

export function CalculatorField({
  field,
  value,
  onChange,
}: {
  field: CalculatorFieldConfig;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>{field.label}</label>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          value={Number.isFinite(value) ? value : ""}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          style={{
            width: "100%", padding: "0.625rem 0.875rem", borderRadius: 10,
            background: "var(--color-bg-input)", border: "1px solid var(--color-border-glass)",
            color: "var(--color-text-primary)", fontSize: "0.9375rem", fontWeight: 600,
            paddingRight: field.suffix ? "3.5rem" : "0.875rem",
          }}
        />
        {field.suffix && (
          <span
            style={{
              position: "absolute", right: "0.875rem", top: "50%", transform: "translateY(-50%)",
              fontSize: "0.8125rem", color: "var(--color-text-muted)", fontWeight: 600, pointerEvents: "none",
            }}
          >
            {field.suffix}
          </span>
        )}
      </div>
      {field.min !== undefined && field.max !== undefined && (
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number.isFinite(value) ? value : field.min}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--color-accent)" }}
        />
      )}
    </div>
  );
}
