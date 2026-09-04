"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CALCULATORS } from "@/lib/calculators/registry";

const CURRENCY_CARD = { slug: "currency", title: "Currency Calculator", description: "Live exchange-rate conversion.", icon: "💱" };

export default function CalculatorsHubPage() {
  const cards = [...CALCULATORS, CURRENCY_CARD];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
          Calculators
        </h1>
        <p style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)" }}>
          Real-time financial calculators — every result updates instantly as you type.
        </p>
      </motion.div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
        {cards.map((c, i) => (
          <motion.div key={c.slug} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.03 }}>
            <Link
              href={`/calculators/${c.slug}`}
              className="glass-card"
              style={{ display: "block", padding: "1.5rem", textDecoration: "none", height: "100%" }}
            >
              <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{c.icon}</div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "0.375rem" }}>{c.title}</h3>
              <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>{c.description}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
