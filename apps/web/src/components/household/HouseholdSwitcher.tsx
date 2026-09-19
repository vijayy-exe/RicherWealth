"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, User, Users, Check } from "lucide-react";
import { useMyHouseholds } from "@/hooks/useHousehold";
import { useHouseholdStore } from "@/store/household.store";

/**
 * Phase 21 household/personal view switcher — mirrors the app layout's own
 * NavGroup dropdown mechanics (apps/web/src/app/(app)/layout.tsx) exactly:
 * local open/close state, outside-click + Escape to dismiss. The first
 * component in this codebase to drive a Zustand store from a dropdown.
 */
export function HouseholdSwitcher() {
  const { data: households } = useMyHouseholds();
  const { activeHouseholdId, setActiveHousehold } = useHouseholdStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
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

  // No households yet — nothing useful to switch between.
  if (!households || households.length === 0) return null;

  const active = households.find((h) => h.id === activeHouseholdId);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "7px 12px", borderRadius: "var(--radius-md)",
          fontSize: "0.8125rem", fontWeight: 600,
          color: "var(--color-text-primary)",
          background: open ? "var(--color-bg-card-hover)" : "var(--color-bg-input)",
          border: "1px solid var(--color-border-glass)",
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {active ? <Users size={15} /> : <User size={15} />}
        {active ? active.name : "Personal"}
        <ChevronDown size={13} strokeWidth={2.25} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
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
              position: "absolute", top: "calc(100% + 8px)", right: 0, minWidth: 220,
              padding: 6, borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-glass)",
              background: "var(--color-bg-elevated)", boxShadow: "var(--shadow-lg)",
              display: "flex", flexDirection: "column", gap: 1, zIndex: 60,
            }}
          >
            <SwitcherRow
              label="Personal"
              icon={User}
              selected={activeHouseholdId === null}
              onClick={() => { setActiveHousehold(null); setOpen(false); }}
            />
            {households.map((h) => (
              <SwitcherRow
                key={h.id}
                label={h.name}
                icon={Users}
                selected={activeHouseholdId === h.id}
                onClick={() => { setActiveHousehold(h.id); setOpen(false); }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SwitcherRow({ label, icon: Icon, selected, onClick }: { label: string; icon: typeof User; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
        borderRadius: "var(--radius-md)", fontSize: "0.8125rem",
        fontWeight: selected ? 600 : 500,
        color: selected ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        background: selected ? "var(--color-accent-muted)" : "transparent",
        border: "none", textAlign: "left", cursor: "pointer", width: "100%",
      }}
    >
      <Icon size={15} strokeWidth={2} style={{ color: selected ? "var(--color-accent)" : "var(--color-text-muted)", flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      {selected && <Check size={14} style={{ color: "var(--color-accent)" }} />}
    </button>
  );
}
