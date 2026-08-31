"use client";

import React from "react";
import { cn } from "../utils/cn";

type BadgeVariant = "default" | "gain" | "loss" | "accent" | "outline";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--color-bg-input)] text-[var(--color-text-secondary)] border-[var(--color-border-glass)]",
  gain: "badge-gain",
  loss: "badge-loss",
  accent: "bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)] border-opacity-20",
  outline: "bg-transparent text-[var(--color-text-primary)] border-[var(--color-border-strong)]",
};

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        "px-2.5 py-0.5 rounded-full text-xs font-semibold border",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
