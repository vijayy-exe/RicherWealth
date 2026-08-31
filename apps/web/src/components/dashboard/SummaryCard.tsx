"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SummaryCardProps {
  label: string;
  value: number;
  changeAbs?: number;
  changePct?: number;
  currency: string;
  isPrimary?: boolean;
  delay?: number;
}

function formatCurrency(value: number, currency: string): string {
  const absValue = Math.abs(value);
  // Format as lakhs/crores for INR, K/M for others
  if (currency === "INR") {
    if (absValue >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
    if (absValue >= 100_000)   return `₹${(value / 100_000).toFixed(2)}L`;
    return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency + " ";
  if (absValue >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(2)}M`;
  if (absValue >= 1_000)     return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function useCountUp(target: number, duration = 1200) {
  const ref = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = performance.now();
    const startVal = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (target - startVal) * eased;
      el.dataset["value"] = current.toString();
      el.dispatchEvent(new CustomEvent("tick", { detail: current }));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return ref;
}

export function SummaryCard({
  label,
  value,
  changeAbs,
  changePct,
  currency,
  isPrimary = false,
  delay = 0,
}: SummaryCardProps) {
  const countRef = useRef<HTMLSpanElement>(null);

  // Count-up animation
  useEffect(() => {
    const el = countRef.current;
    if (!el) return;

    const duration = isPrimary ? 1600 : 1000;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = value * eased;
      el.textContent = formatCurrency(current, currency);
      if (progress < 1) requestAnimationFrame(tick);
    };

    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, currency, isPrimary]);

  const isPositive = (changeAbs ?? 0) >= 0;
  const isZero = changeAbs === undefined || changeAbs === 0;

  const TrendIcon = isZero ? Minus : isPositive ? TrendingUp : TrendingDown;
  const trendColor = isZero
    ? "var(--color-text-muted)"
    : isPositive
    ? "var(--color-gain)"
    : "var(--color-loss)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={isPrimary ? "glass-card col-span-2" : "glass-card"}
      style={{ padding: isPrimary ? "2rem" : "1.5rem" }}
    >
      <p
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </p>

      <span
        ref={countRef}
        style={{
          display: "block",
          fontSize: isPrimary ? "2.5rem" : "1.75rem",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
          marginBottom: "0.75rem",
        }}
      >
        {formatCurrency(0, currency)}
      </span>

      {changeAbs !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <TrendIcon size={14} color={trendColor} />
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: trendColor,
            }}
          >
            {isPositive && !isZero ? "+" : ""}
            {formatCurrency(changeAbs, currency)}
          </span>
          {changePct !== undefined && !isZero && (
            <span
              style={{
                fontSize: "0.75rem",
                color: trendColor,
                opacity: 0.8,
              }}
            >
              ({isPositive ? "+" : ""}{changePct.toFixed(2)}%)
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
