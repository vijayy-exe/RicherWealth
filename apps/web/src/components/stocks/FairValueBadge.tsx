"use client";

type FairValueFlag = "UNDERVALUED" | "FAIR" | "OVERVALUED" | "NO_DATA";

const CONFIG: Record<FairValueFlag, { label: string; bg: string; color: string; icon: string }> = {
  UNDERVALUED: { label: "Undervalued", bg: "rgba(0,217,126,0.15)", color: "#00D97E", icon: "↓" },
  FAIR: { label: "Fair", bg: "rgba(61,131,255,0.12)", color: "#3D83FF", icon: "≈" },
  OVERVALUED: { label: "Overvalued", bg: "rgba(245,166,35,0.15)", color: "#F5A623", icon: "↑" },
  NO_DATA: { label: "No data", bg: "rgba(92,104,128,0.12)", color: "#5C6880", icon: "?" },
};

export function FairValueBadge({ flag }: { flag: FairValueFlag }) {
  const c = CONFIG[flag];
  return (
    <span
      title={`Graham formula: ${c.label}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap",
        background: c.bg, color: c.color,
        fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em",
        border: `1px solid ${c.color}30`,
      }}
    >
      {c.icon} {c.label}
    </span>
  );
}
