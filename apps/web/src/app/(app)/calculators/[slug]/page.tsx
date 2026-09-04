"use client";

import { use as usePromise, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { motion } from "framer-motion";
import { CALCULATOR_MAP } from "@/lib/calculators/registry";
import { CalculatorField } from "@/components/calculators/CalculatorField";
import { CalculatorGrowthChart } from "@/components/calculators/CalculatorGrowthChart";
import { SaveAsGoalButton } from "@/components/calculators/SaveAsGoalModal";
import { formatResultValue } from "@/lib/calculators/format";
import { CurrencyCalculator } from "@/components/calculators/CurrencyCalculator";

export default function CalculatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = usePromise(params);

  if (slug === "currency") {
    return <CalculatorShellFrame title="Currency Calculator" description="Live exchange-rate conversion." icon="💱"><CurrencyCalculator /></CalculatorShellFrame>;
  }

  const config = CALCULATOR_MAP.get(slug);
  if (!config) notFound();

  return <GenericCalculator config={config} />;
}

function CalculatorShellFrame({ title, description, icon, children }: { title: string; description: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <Header title={title} description={description} icon={icon} />
      {children}
    </div>
  );
}

function Header({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Link href="/calculators" style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", textDecoration: "none", marginBottom: "0.75rem", display: "inline-block" }}>
        ← All Calculators
      </Link>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
        {icon} {title}
      </h1>
      <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>{description}</p>
    </motion.div>
  );
}

function GenericCalculator({ config }: { config: NonNullable<ReturnType<typeof CALCULATOR_MAP.get>> }) {
  const [values, setValues] = useState<Record<string, number>>(
    () => Object.fromEntries(config.fields.map((f) => [f.key, f.defaultValue])),
  );

  // Live recompute on every keystroke — no submit button, matching the
  // established pattern from the Phase 9 loan-detail prepayment slider.
  const result = useMemo(() => config.compute(values), [config, values]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <Header title={config.title} description={config.description} icon={config.icon} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }} className="calc-grid">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="glass-card" style={{ padding: "1.5rem" }}>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
            Inputs
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {config.fields.map((f) => (
              <CalculatorField key={f.key} field={f} value={values[f.key] ?? f.defaultValue} onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))} />
            ))}
          </div>
        </motion.div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.1 }} className="glass-card" style={{ padding: "1.5rem" }}>
            <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
              Results
            </h3>
            {result.error ? (
              <p style={{ fontSize: "0.875rem", color: "#FF4D6D" }}>{result.error}</p>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1.25rem" }}>
                  {result.fields.map((f) => (
                    <div key={f.label}>
                      <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.25rem" }}>
                        {f.label}
                      </div>
                      <div style={{ fontSize: f.highlight ? "1.75rem" : "1.125rem", fontWeight: 800, color: f.highlight ? "var(--color-accent)" : "var(--color-text-primary)" }}>
                        {formatResultValue(f.value, f.format)}
                      </div>
                    </div>
                  ))}
                </div>
                {result.goalMapping && (
                  <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--color-border-glass)" }}>
                    <SaveAsGoalButton mapping={result.goalMapping} />
                  </div>
                )}
              </>
            )}
          </motion.div>

          {result.chart && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="glass-card" style={{ padding: "1.5rem" }}>
              <h3 style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
                Growth Curve
              </h3>
              <CalculatorGrowthChart config={result.chart} />
            </motion.div>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (min-width: 1024px) {
          .calc-grid { grid-template-columns: 380px 1fr; }
        }
      `}</style>
    </div>
  );
}
