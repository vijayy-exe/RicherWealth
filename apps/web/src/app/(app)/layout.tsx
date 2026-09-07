"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Layers,
  Gem,
  ClipboardList,
  TrendingUp,
  Landmark,
  Building2,
  Bitcoin,
  Coins,
  Boxes,
  Home,
  Wallet,
  Receipt,
  LineChart,
  ShieldCheck,
  Globe2,
  FileText,
  Target,
  Calculator,
  Lock,
  Settings as SettingsIcon,
  ChevronDown,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavEntry {
  label: string;
  icon: LucideIcon;
  href?: string; // single link
  items?: NavItem[]; // grouped dropdown
}

// Grouped so the top bar always fits — a flat list of 18+ phases doesn't.
// Lucide icons, not emoji: consistent stroke weight/size reads as a real
// product nav rather than a row of decorative stickers.
const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Holdings",
    icon: Layers,
    items: [
      { href: "/assets", label: "Assets", icon: Gem },
      { href: "/liabilities", label: "Liabilities", icon: ClipboardList },
      { href: "/stocks", label: "Stocks", icon: TrendingUp },
      { href: "/mutual-funds", label: "Mutual Funds", icon: Landmark },
      { href: "/bonds", label: "Bonds", icon: Building2 },
      { href: "/crypto", label: "Crypto", icon: Bitcoin },
      { href: "/precious-metals", label: "Precious Metals", icon: Coins },
      { href: "/commodities", label: "Commodities", icon: Boxes },
      { href: "/real-estate", label: "Real Estate", icon: Home },
    ],
  },
  {
    label: "Cash Flow",
    icon: Wallet,
    items: [
      { href: "/income", label: "Income", icon: Wallet },
      { href: "/transactions", label: "Transactions", icon: Receipt },
    ],
  },
  {
    label: "Insights",
    icon: LineChart,
    items: [
      { href: "/analytics", label: "Analytics", icon: LineChart },
      { href: "/risk", label: "Risk", icon: ShieldCheck },
      { href: "/markets", label: "Markets", icon: Globe2 },
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/ai-chat", label: "AI Chat", icon: Sparkles },
    ],
  },
  {
    label: "Planning",
    icon: Target,
    items: [
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/calculators", label: "Calculators", icon: Calculator },
      { href: "/tax", label: "Tax Center", icon: Landmark },
      { href: "/vault", label: "Vault", icon: Lock },
    ],
  },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
];

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 13px",
    borderRadius: "var(--radius-md)",
    fontSize: "0.8125rem",
    fontWeight: active ? 600 : 500,
    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    background: active ? "var(--color-accent-muted)" : "transparent",
    border: "1px solid transparent",
    textDecoration: "none",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
  };
}

function SingleNavLink({ href, label, icon: Icon }: NavItem) {
  const pathname = usePathname();
  return (
    <Link href={href} style={pillStyle(isItemActive(pathname, href))}>
      <Icon size={16} strokeWidth={2} />
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
  const GroupIcon = entry.icon;

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
        <GroupIcon size={16} strokeWidth={2} />
        {entry.label}
        <ChevronDown
          size={13}
          strokeWidth={2.25}
          style={{
            marginLeft: -1,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
            color: "var(--color-text-muted)",
          }}
        />
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
              minWidth: 208,
              padding: 6,
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-glass)",
              background: "var(--color-bg-elevated)",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              zIndex: 60,
            }}
          >
            {items.map((item) => {
              const active = isItemActive(pathname, item.href);
              const ItemIcon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 10px",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.8125rem",
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    background: active ? "var(--color-accent-muted)" : "transparent",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  <ItemIcon size={15} strokeWidth={2} style={{ color: active ? "var(--color-accent)" : "var(--color-text-muted)", flexShrink: 0 }} />
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
          gap: 28,
        }}
      >
        {/* Logo — a solid mark + wordmark, not a gradient-clip effect */}
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", flexShrink: 0 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <TrendingUp size={16} strokeWidth={2.5} color="#fff" />
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: "1.0625rem",
              letterSpacing: "-0.02em",
              color: "var(--color-text-primary)",
              whiteSpace: "nowrap",
            }}
          >
            RicherWealth
          </span>
        </Link>

        {/* Nav — grouped so it never overflows the viewport */}
        <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
          {NAV.map((entry) =>
            entry.href ? (
              <SingleNavLink key={entry.href} href={entry.href} label={entry.label} icon={entry.icon} />
            ) : (
              <NavGroup key={entry.label} entry={entry} />
            ),
          )}
        </nav>

        <NotificationBell />
      </header>

      <main style={{ flex: 1, padding: "32px 24px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
