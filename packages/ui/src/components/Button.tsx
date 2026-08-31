"use client";

import React from "react";
import { cn } from "../utils/cn";

type ButtonVariant = "primary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-[var(--color-accent)] text-white border-transparent",
    "hover:bg-[var(--color-accent-hover)]",
    "hover:shadow-[var(--shadow-glow-accent)]",
    "hover:-translate-y-px",
    "active:translate-y-0",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none",
  ].join(" "),
  ghost: [
    "bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border-[var(--color-border-glass)]",
    "hover:bg-[var(--color-bg-card-hover)] hover:border-[var(--color-border-strong)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  outline: [
    "bg-transparent text-[var(--color-accent)] border-[var(--color-accent)]",
    "hover:bg-[var(--color-accent-muted)]",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
  danger: [
    "bg-[var(--color-loss)] text-white border-transparent",
    "hover:opacity-90 hover:-translate-y-px",
    "active:translate-y-0",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-[var(--radius-sm)]",
  md: "h-10 px-5 text-sm rounded-[var(--radius-md)]",
  lg: "h-12 px-7 text-base rounded-[var(--radius-md)]",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "font-semibold border",
        "transition-all duration-[var(--duration-fast)]",
        "focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled ?? isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner size="sm" />
          {children}
        </>
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  );
}

// ─── Spinner (co-located for use in Button) ───────────────────────────────────

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const sizes = { sm: "w-3.5 h-3.5", md: "w-5 h-5", lg: "w-7 h-7" };
  return (
    <svg
      className={cn("animate-spin text-current", sizes[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
