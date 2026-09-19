"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, ChevronDown, ChevronUp, X, Check, RefreshCw } from "lucide-react";
import {
  useAiSuggestions,
  useGenerateAiSuggestions,
  useUpdateAiSuggestionStatus,
  type AiSuggestionRow,
  type AiSuggestionType,
} from "@/hooks/useAiSuggestions";

const TYPE_LABEL: Record<AiSuggestionType, string> = {
  SELL: "Sell",
  BUY: "Buy",
  REBALANCE: "Rebalance",
  TAX_HARVEST: "Tax Harvest",
  INCREASE_SIP: "Increase SIP",
  DEBT_COST_ALERT: "Debt Cost Alert",
  RETIREMENT_ACCELERATION: "Retirement Boost",
  LOW_FEE_ALTERNATIVE: "Low-Fee Alternative",
  DIVIDEND_OPPORTUNITY: "Dividend Opportunity",
};

const TYPE_TONE: Record<AiSuggestionType, string> = {
  SELL: "var(--color-loss)",
  BUY: "var(--color-gain)",
  REBALANCE: "var(--color-warning)",
  TAX_HARVEST: "var(--color-info)",
  INCREASE_SIP: "var(--color-accent)",
  DEBT_COST_ALERT: "var(--color-loss)",
  RETIREMENT_ACCELERATION: "var(--color-accent)",
  LOW_FEE_ALTERNATIVE: "var(--color-info)",
  DIVIDEND_OPPORTUNITY: "var(--color-info)",
};

function SuggestionCard({ suggestion }: { suggestion: AiSuggestionRow }) {
  const [expanded, setExpanded] = useState(false);
  const updateStatus = useUpdateAiSuggestionStatus();
  const tone = TYPE_TONE[suggestion.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--color-border-glass)",
        background: "var(--color-bg-card)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <span
            style={{
              alignSelf: "flex-start",
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: "var(--radius-full)",
              color: tone,
              background: "color-mix(in srgb, " + tone + " 15%, transparent)",
            }}
          >
            {TYPE_LABEL[suggestion.type]}
          </span>
          <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--color-text-primary)" }}>{suggestion.title}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            aria-label="Acted on"
            onClick={() => updateStatus.mutate({ id: suggestion.id, status: "ACTED_ON" })}
            style={iconButtonStyle("var(--color-gain)")}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => updateStatus.mutate({ id: suggestion.id, status: "DISMISSED" })}
            style={iconButtonStyle("var(--color-text-muted)")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{suggestion.description}</p>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          alignSelf: "flex-start",
          fontSize: "0.75rem",
          color: "var(--color-accent)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {expanded ? "Hide" : "View"} the data behind this {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-input)",
                border: "1px solid var(--color-border-subtle)",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {Object.entries(suggestion.dataPoint).map(([key, value]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.75rem" }}>
                  <span style={{ color: "var(--color-text-muted)" }}>{key}</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>
                    {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function iconButtonStyle(color: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--color-border-glass)",
    background: "transparent",
    color,
    cursor: "pointer",
  };
}

/**
 * Surfaced on the Dashboard per this app's own stated philosophy ("what
 * should I do next to maximize my wealth?", PROJECT_CONTEXT.md) rather than
 * buried in a sub-page. Shows up to 4 active suggestions; each card's
 * "view the data behind this" expands the exact dataPoint (holding/ratio/
 * threshold) that triggered it — SuggestionEngineService never generates a
 * card without one.
 */
export function SuggestionsPanel() {
  const { data: suggestions, isLoading } = useAiSuggestions();
  const generate = useGenerateAiSuggestions();

  if (isLoading) return null;

  const active = (suggestions ?? []).slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lightbulb size={16} color="var(--color-accent)" />
          <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--color-text-primary)" }}>Suggestions</span>
        </div>
        <button
          type="button"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.75rem",
            color: "var(--color-text-secondary)",
            background: "none",
            border: "1px solid var(--color-border-glass)",
            borderRadius: "var(--radius-md)",
            padding: "6px 10px",
            cursor: generate.isPending ? "default" : "pointer",
          }}
        >
          <RefreshCw size={12} style={{ animation: generate.isPending ? "spin 1s linear infinite" : "none" }} />
          {generate.isPending ? "Checking…" : "Refresh"}
        </button>
      </div>

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {active.length === 0 ? (
        <div
          style={{
            padding: "24px 16px",
            textAlign: "center",
            borderRadius: "var(--radius-lg)",
            border: "1px dashed var(--color-border-glass)",
            color: "var(--color-text-muted)",
            fontSize: "0.8125rem",
          }}
        >
          No suggestions right now — nothing in your portfolio has crossed a threshold worth flagging. Click Refresh to check again.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          <AnimatePresence>
            {active.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
