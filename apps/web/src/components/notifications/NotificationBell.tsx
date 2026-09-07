"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";
import { useNotifications, useUnreadCount, useMarkRead, useMarkAllRead, type NotificationRow } from "@/hooks/useNotifications";

const TYPE_ICON: Record<string, string> = {
  MARKET_CRASH: "📉",
  DIVIDEND_RECEIVED: "💵",
  LOAN_DUE: "📋",
  SIP_DUE: "🏦",
  STOCK_PRICE_ALERT: "📈",
  CRYPTO_PRICE_ALERT: "₿",
  PROPERTY_PRICE_CHANGE: "🏠",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: unread } = useUnreadCount();
  const { data: notifications } = useNotifications(20);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

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

  const unreadCount = unread?.count ?? 0;

  return (
    <div ref={containerRef} style={{ position: "relative", marginLeft: "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "var(--radius-full)",
          border: "1px solid transparent",
          background: open ? "var(--color-bg-card-hover)" : "transparent",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: "0 3px",
              borderRadius: "var(--radius-full)",
              background: "#FF5C5C",
              color: "white",
              fontSize: "0.625rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 360,
              maxHeight: 420,
              overflowY: "auto",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-glass)",
              background: "var(--color-bg-elevated)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 60,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border-subtle)",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--color-text-primary)" }}>Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead.mutate()}
                  style={{ fontSize: "0.75rem", color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {!notifications || notifications.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
                No notifications yet. We&apos;ll let you know when something needs your attention.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {notifications.map((n: NotificationRow) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                    }}
                    style={{
                      display: "flex",
                      gap: 10,
                      textAlign: "left",
                      padding: "12px 16px",
                      border: "none",
                      borderBottom: "1px solid var(--color-border-subtle)",
                      background: n.read ? "transparent" : "var(--color-accent-muted)",
                      cursor: n.read ? "default" : "pointer",
                    }}
                  >
                    <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{TYPE_ICON[n.type] ?? "🔔"}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: "0.8125rem", fontWeight: n.read ? 500 : 700, color: "var(--color-text-primary)" }}>
                        {n.title}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.body}
                      </span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>{timeAgo(n.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
