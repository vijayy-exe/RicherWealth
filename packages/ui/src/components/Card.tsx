"use client";

import React from "react";
import { cn } from "../utils/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingSizes = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({ glass = true, padding = "md", className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        glass
          ? [
              "backdrop-blur-[var(--glass-blur)]",
              "border border-[var(--color-border-glass)]",
              "rounded-[var(--radius-lg)]",
              "bg-[var(--color-bg-card)]",
              "transition-all duration-[var(--duration-fast)]",
            ].join(" ")
          : "rounded-[var(--radius-lg)]",
        paddingSizes[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
