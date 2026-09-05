"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavEntry {
  label: string;
  icon?: string;
  href?: string; // single link
  items?: NavItem[]; // grouped dropdown
}

// Grouped so the top bar always fits — a flat list of 18+ phases doesn't.
const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  {
    label: "Holdings",
    icon: "💎",
    items: [
      { href: "/assets", label: "Assets", icon: "💎" },
      { href: "/liabilities", label: "Liabilities", icon: "📋" },
      { href: "/stocks", label: "Stocks", icon: "📈" },
      { href: "/mutual-funds", label: "Mutual Funds", icon: "🏦" },
      { href: "/bonds", label: "Bonds", icon: "🏛️" },
      { href: "/crypto", label: "Crypto", icon: "₿" },
      { href: "/precious-metals", label: "Precious Metals", icon: "🥇" },
      { href: "/commodities", label: "Commodities", icon: "🛢️" },
      { href: "/real-estate", label: "Real Estate", icon: "🏠" },
    ],
  },
  {
    label: "Cash Flow",
    icon: "💵",
    items: [
      { href: "/income", label: "Income", icon: "💵" },
      { href: "/transactions", label: "Transactions", icon: "🧾" },
    ],
  },
  {
    label: "Insights",
    icon: "📐",
    items: [
      { href: "/analytics", label: "Analytics", icon: "📐" },
      { href: "/risk", label: "Risk", icon: "🛡️" },
      { href: "/markets", label: "Markets", icon: "🌐" },
    ],
  },
  {
    label: "Planning",
    icon: "🎯",
    items: [
      { href: "/goals", label: "Goals", icon: "🎯" },
      { href: "/calculators", label: "Calculators", icon: "🧮" },
      { href: "/tax", label: "Tax Center", icon: "🧾" },
      { href: "/vault", label: "Vault", icon: "🔐" },
    ],
  },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: "var(--radius-full)",
    fontSize: "0.875rem",
    fontWeight: active ? 600 : 500,
    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    background: active ? "var(--color-accent-muted)" : "transparent",
    border: `1px solid ${active ? "var(--color-accent-glow)" : "transparent"}`,
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };
}

function SingleNavLink({ href, label, icon }: NavItem) {
  const pathname = usePathname();
  return (
    <Link href={href} style={pillStyle(isItemActive(pathname, href))}>
      <span style={{ fontSize: "0.9rem" }}>{icon}</span>
      {label}
    </Link>
  );
}

function NavGroup({ entry }: { entry: NavEntry }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const items = entry.items ?? [];
  const groupActive = items.some((item) => isItemActive(pathname, item.href));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ ...pillStyle(groupActive), background: open ? "var(--color-bg-card-hover)" : pillStyle(groupActive).background }}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span style={{ fontSize: "0.9rem" }}>{entry.icon}</span>
        {entry.label}
        <span
          style={{
            fontSize: "0.6rem",
            marginLeft: 2,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
            color: "var(--color-text-muted)",
          }}
        >
          ▼
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              minWidth: 200,
              padding: 6,
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-glass)",
              background: "var(--color-bg-elevated)",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              zIndex: 60,
            }}
          >
            {items.map((item) => {
              const active = isItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.875rem",
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    background: active ? "var(--color-accent-muted)" : "transparent",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontSize: "0.9rem" }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          height: 60,
          borderBottom: "1px solid var(--color-border-glass)",
          background: "var(--color-bg-elevated)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: 24,
        }}
      >
        {/* Logo */}
        <span
          style={{
            fontWeight: 800,
            fontSize: "1.125rem",
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #3D83FF, #00D97E)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            whiteSpace: "nowrap",
          }}
        >
          RicherWealth
        </span>

        {/* Nav — grouped so it never overflows the viewport */}
        <nav style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
          {NAV.map((entry) =>
            entry.href ? (
              <SingleNavLink key={entry.href} href={entry.href} label={entry.label} icon={entry.icon ?? ""} />
            ) : (
              <NavGroup key={entry.label} entry={entry} />
            ),
          )}
        </nav>
      </header>

      <main style={{ flex: 1, padding: "32px 24px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
