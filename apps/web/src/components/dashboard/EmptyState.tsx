"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const QUICK_ADD = [
  { icon: "📈", label: "Stocks & ETFs", href: "/assets/add?type=STOCK" },
  { icon: "₿", label: "Cryptocurrency", href: "/assets/add?type=CRYPTO" },
  { icon: "🏠", label: "Real Estate", href: "/assets/add?type=REAL_ESTATE" },
  { icon: "🏦", label: "Mutual Funds", href: "/assets/add?type=MUTUAL_FUND" },
  { icon: "✨", label: "Gold & Silver", href: "/assets/add?type=GOLD" },
  { icon: "🏧", label: "Cash & Bank", href: "/assets/add?type=CASH" },
];

export function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}
    >
      {/* Illustration */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        style={{
          width: 120,
          height: 120,
          margin: "0 auto 2rem",
          borderRadius: "50%",
          background: "var(--color-accent-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "3.5rem",
          boxShadow: "var(--shadow-glow-accent)",
        }}
      >
        💎
      </motion.div>

      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{
          fontSize: "1.75rem",
          fontWeight: 800,
          color: "var(--color-text-primary)",
          marginBottom: "0.75rem",
          lineHeight: 1.2,
        }}
      >
        Your wealth journey starts here
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{
          fontSize: "1rem",
          color: "var(--color-text-secondary)",
          lineHeight: 1.6,
          marginBottom: "2.5rem",
        }}
      >
        Add your first asset to see your net worth, track growth over time,
        and unlock AI-powered insights to maximize your wealth.
      </motion.p>

      {/* Quick-add grid */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem",
          marginBottom: "2rem",
        }}
      >
        {QUICK_ADD.map((item, i) => (
          <motion.div
            key={item.href}
            whileHover={{ scale: 1.04, y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Link
              href={item.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5rem",
                padding: "1rem 0.75rem",
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-glass)",
                borderRadius: "var(--radius-lg)",
                textDecoration: "none",
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ fontSize: "1.75rem" }}>{item.icon}</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                {item.label}
              </span>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}
      >
        You can also{" "}
        <button
          style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontWeight: 600 }}
        >
          import from a spreadsheet
        </button>
        {" "}or{" "}
        <button
          style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontWeight: 600 }}
        >
          connect a broker
        </button>
        {" "}to auto-sync.
      </motion.p>
    </motion.div>
  );
}
