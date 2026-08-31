"use client";

import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 640 }: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 1000,
              background: "rgba(9, 14, 26, 0.85)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Panel — flex column, scrollable body, pinned footer */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1001,
              width: `min(${width}px, calc(100vw - 32px))`,
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            {/* Optional title bar */}
            {title && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "20px 28px 0",
                flexShrink: 0,
              }}>
                <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  style={{
                    width: 32, height: 32, borderRadius: "var(--radius-full)",
                    background: "var(--color-bg-input)",
                    border: "1px solid var(--color-border-glass)",
                    color: "var(--color-text-muted)",
                    fontSize: "1rem", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Scrollable content area */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "28px 28px 24px",
              minHeight: 0, // critical for flex overflow to work
            }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
