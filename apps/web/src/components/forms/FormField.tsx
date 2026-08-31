"use client";

import { type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FormFieldProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}

export function FormField({ label, error, hint, required, children, htmlFor }: FormFieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          letterSpacing: "0.01em",
        }}
      >
        {label}
        {required && <span style={{ color: "var(--color-accent)", marginLeft: 2 }}>*</span>}
      </label>

      {children}

      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            style={{ fontSize: "0.75rem", color: "var(--color-loss)", display: "flex", alignItems: "center", gap: 4 }}
          >
            <span>⚠</span> {error}
          </motion.p>
        ) : hint ? (
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{hint}</p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ─── Shared input base styles ─────────────────────────────────────────────────

export const inputStyle = (hasError?: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "0.625rem 0.875rem",
  background: "var(--color-bg-input)",
  border: `1px solid ${hasError ? "var(--color-loss)" : "var(--color-border-glass)"}`,
  borderRadius: "var(--radius-md)",
  color: "var(--color-text-primary)",
  fontSize: "0.9375rem",
  fontFamily: "var(--font-sans)",
  outline: "none",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
});
