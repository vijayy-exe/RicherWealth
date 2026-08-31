"use client";

export function StalePriceBadge({ lastSyncAt }: { lastSyncAt: string | null }) {
  if (!lastSyncAt) return <span title="Price never synced" style={{ fontSize: "0.7rem", color: "var(--color-text-muted)" }}>— no data</span>;

  const ageMin = Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 60_000);
  if (ageMin < 20) return null;

  return (
    <span
      title={`Price data is ${ageMin}m old — will refresh on next sync cycle`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "1px 6px", borderRadius: 20,
        background: "rgba(245,166,35,0.12)",
        border: "1px solid rgba(245,166,35,0.3)",
        color: "#F5A623",
        fontSize: "0.6rem", fontWeight: 700,
        letterSpacing: "0.06em",
        cursor: "help",
        userSelect: "none",
      }}
    >
      ⚡ stale
    </span>
  );
}
