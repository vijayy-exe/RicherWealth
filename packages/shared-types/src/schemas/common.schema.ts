import { z } from "zod";

// ─── Common primitives ────────────────────────────────────────────────────────

/** ISO 4217 currency code (3 uppercase letters) */
export const CurrencyCodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "Must be a valid ISO 4217 currency code (e.g. USD, INR, EUR)");

/** Positive decimal — used for monetary amounts */
export const PositiveDecimalSchema = z
  .number()
  .positive("Must be a positive number")
  .finite("Must be a finite number");

/** Non-negative decimal — for values that can be zero */
export const NonNegativeDecimalSchema = z
  .number()
  .nonnegative("Must be zero or positive")
  .finite("Must be a finite number");

/** Annual percentage rate (0 – 100) */
export const AnnualRateSchema = z
  .number()
  .min(0, "Rate cannot be negative")
  .max(100, "Rate cannot exceed 100%");

/** ISO 8601 date string */
export const DateSchema = z.string().datetime({ offset: true });

/** CUID — matches Prisma's default ID format */
export const CuidSchema = z.string().cuid();

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
export type PositiveDecimal = z.infer<typeof PositiveDecimalSchema>;
export type NonNegativeDecimal = z.infer<typeof NonNegativeDecimalSchema>;
