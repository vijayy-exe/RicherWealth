"use client";

import { motion } from "framer-motion";
import type { AssetType } from "@richer/shared-types";
import {
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  BarChart3,
  PieChart,
  Landmark,
  ScrollText,
  Bitcoin,
  Handshake,
  Sparkles,
  Medal,
  Award,
  Fuel,
  Home,
  Building2,
  Palmtree,
  ShieldCheck,
  FileCheck2,
  Briefcase,
  Factory,
  Lock,
  Rocket,
  Palette,
  Car,
  Watch,
  Image as ImageIcon,
  Package,
  ArrowLeftRight,
  Gem,
  type LucideIcon,
} from "lucide-react";

// ─── Category definitions ────────────────────────────────────────────────────
// Lucide icons, not emoji — a rounded-square tinted badge per category/type
// (see IconBadge-style rendering below) reads as a real product, not a
// sticker sheet.

export const ASSET_CATEGORIES = [
  {
    label: "Cash & Banking",
    color: "#3D83FF",
    icon: Wallet,
    types: [
      { type: "CASH" as AssetType, label: "Bank Account", icon: CreditCard },
      { type: "FIXED_DEPOSIT" as AssetType, label: "Fixed Deposit / CD", icon: PiggyBank },
    ],
  },
  {
    label: "Investments",
    color: "#00D97E",
    icon: TrendingUp,
    types: [
      { type: "STOCK" as AssetType, label: "Stocks", icon: BarChart3 },
      { type: "ETF" as AssetType, label: "ETF", icon: PieChart },
      { type: "MUTUAL_FUND" as AssetType, label: "Mutual Fund", icon: Landmark },
      { type: "BOND" as AssetType, label: "Bond", icon: ScrollText },
      { type: "CRYPTO" as AssetType, label: "Cryptocurrency", icon: Bitcoin },
      { type: "P2P_LENDING" as AssetType, label: "P2P Lending", icon: Handshake },
    ],
  },
  {
    label: "Commodities",
    color: "#F5A623",
    icon: Sparkles,
    types: [
      { type: "GOLD" as AssetType, label: "Gold", icon: Medal },
      { type: "SILVER" as AssetType, label: "Silver", icon: Award },
      { type: "COMMODITY" as AssetType, label: "Other Commodity", icon: Fuel },
    ],
  },
  {
    label: "Real Estate",
    color: "#9B59B6",
    icon: Home,
    types: [
      { type: "REAL_ESTATE" as AssetType, label: "Property", icon: Home },
      { type: "REIT" as AssetType, label: "REIT", icon: Building2 },
    ],
  },
  {
    label: "Retirement",
    color: "#1ABC9C",
    icon: Palmtree,
    types: [
      { type: "RETIREMENT_ACCOUNT" as AssetType, label: "Retirement Account", icon: Palmtree },
    ],
  },
  {
    label: "Insurance",
    color: "#E74C3C",
    icon: ShieldCheck,
    types: [
      { type: "INSURANCE" as AssetType, label: "Insurance Policy", icon: FileCheck2 },
    ],
  },
  {
    label: "Business & Equity",
    color: "#E67E22",
    icon: Briefcase,
    types: [
      { type: "BUSINESS_EQUITY" as AssetType, label: "Business Equity", icon: Factory },
      { type: "PRIVATE_EQUITY" as AssetType, label: "Private Equity", icon: Lock },
      { type: "ANGEL_INVESTMENT" as AssetType, label: "Angel Investment", icon: Rocket },
    ],
  },
  {
    label: "Collectibles & Alts",
    color: "#7F8C8D",
    icon: Palette,
    types: [
      { type: "VEHICLE" as AssetType, label: "Vehicle", icon: Car },
      { type: "COLLECTIBLE" as AssetType, label: "Collectible", icon: Watch },
      { type: "NFT" as AssetType, label: "NFT", icon: ImageIcon },
    ],
  },
  {
    label: "Other",
    color: "#95A5A6",
    icon: Package,
    types: [
      { type: "FOREX" as AssetType, label: "Foreign Currency", icon: ArrowLeftRight },
      { type: "OTHER" as AssetType, label: "Other Asset", icon: Gem },
    ],
  },
] as const;

export const ASSET_TYPE_META: Record<string, { label: string; icon: LucideIcon; color: string }> = {};
ASSET_CATEGORIES.forEach((cat) => {
  cat.types.forEach(({ type, label, icon }) => {
    ASSET_TYPE_META[type] = { label, icon, color: cat.color };
  });
});

interface AssetTypeSelectorProps {
  onSelect: (type: AssetType) => void;
}

export function AssetTypeSelector({ onSelect }: AssetTypeSelectorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>
          What would you like to add?
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          Select the type of asset to get started
        </p>
      </div>

      {ASSET_CATEGORIES.map((cat, catIdx) => {
        const CategoryIcon = cat.icon;
        return (
          <div key={cat.label}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <CategoryIcon size={15} strokeWidth={2} color={cat.color} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {cat.label}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {cat.types.map(({ type, label, icon: TypeIcon }, idx) => (
                <motion.button
                  key={type}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: catIdx * 0.04 + idx * 0.02 }}
                  onClick={() => onSelect(type)}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "12px 14px",
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border-glass)",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = cat.color + "66";
                    (e.currentTarget as HTMLButtonElement).style.background = cat.color + "0F";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-glass)";
                    (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-card)";
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: cat.color + "1A",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <TypeIcon size={16} strokeWidth={2} color={cat.color} />
                  </div>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.3 }}>
                    {label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
