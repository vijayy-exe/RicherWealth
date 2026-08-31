"use client";

import React from "react";
import { cn } from "../utils/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftElement,
      rightElement,
      wrapperClassName,
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftElement && (
            <div className="absolute left-3 text-[var(--color-text-muted)]">{leftElement}</div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full rounded-[var(--radius-md)] border",
              "bg-[var(--color-bg-input)] text-[var(--color-text-primary)]",
              "placeholder:text-[var(--color-text-muted)]",
              "border-[var(--color-border-glass)]",
              "px-4 py-2.5 text-sm",
              "transition-colors duration-[var(--duration-fast)]",
              "focus:outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-card-hover)]",
              error ? "border-[var(--color-loss)]" : "",
              leftElement ? "pl-10" : "",
              rightElement ? "pr-10" : "",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className,
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 text-[var(--color-text-muted)]">{rightElement}</div>
          )}
        </div>
        {error && (
          <p className="text-xs text-[var(--color-loss)]" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
