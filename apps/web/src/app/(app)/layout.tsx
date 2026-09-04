"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/assets", label: "Assets", icon: "💎" },
  { href: "/liabilities", label: "Liabilities", icon: "📋" },
  { href: "/income", label: "Income", icon: "💵" },
  { href: "/transactions", label: "Transactions", icon: "🧾" },
  { href: "/stocks", label: "Stocks", icon: "📈" },
  { href: "/mutual-funds", label: "Mutual Funds", icon: "🏦" },
  { href: "/bonds", label: "Bonds", icon: "🏛️" },
  { href: "/crypto", label: "Crypto", icon: "₿" },
  { href: "/precious-metals", label: "Precious Metals", icon: "🥇" },
  { href: "/commodities", label: "Commodities", icon: "🛢️" },
  { href: "/real-estate", label: "Real Estate", icon: "🏠" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: "var(--radius-full)",
        fontSize: "0.875rem",
        fontWeight: isActive ? 600 : 500,
        color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        background: isActive ? "var(--color-accent-muted)" : "transparent",
        border: `1px solid ${isActive ? "var(--color-accent-glow)" : "transparent"}`,
        textDecoration: "none",
        transition: "all 0.15s ease",
      }}
    >
      <span style={{ fontSize: "0.9rem" }}>{icon}</span>
      {label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
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
        gap: 32,
      }}>
        {/* Logo */}
        <span style={{
          fontWeight: 800,
          fontSize: "1.125rem",
          letterSpacing: "-0.03em",
          background: "linear-gradient(135deg, #3D83FF, #00D97E)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          whiteSpace: "nowrap",
        }}>
          RicherWealth
        </span>

        {/* Nav */}
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} {...link} />
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, padding: "32px 24px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
