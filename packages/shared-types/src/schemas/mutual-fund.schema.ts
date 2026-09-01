import { z } from "zod";

// ─── Mutual Fund Holding ──────────────────────────────────────────────────────

export const CreateMutualFundHoldingSchema = z.object({
  /** MFAPI.in numeric scheme code e.g. "120503" */
  schemeCode: z.string().min(1, "Scheme code is required"),
  fundName: z.string().min(1, "Fund name is required"),
  investmentType: z.enum(["SIP", "LUMPSUM"]).default("LUMPSUM"),
  unitsHeld: z.number().positive("Units must be positive"),
  avgNAV: z.number().positive("Avg NAV must be positive"),
  expenseRatio: z.number().min(0).max(5).optional(),
  isin: z.string().optional(),
  sipFrequency: z.enum(["MONTHLY", "QUARTERLY"]).optional(),
  currencyCode: z.string().default("INR"),
});

export type CreateMutualFundHoldingInput = z.infer<typeof CreateMutualFundHoldingSchema>;

// ─── SIP Installment ─────────────────────────────────────────────────────────

export const CreateSipInstallmentSchema = z.object({
  /** Amount invested in this installment (negative cash-flow from investor's perspective) */
  amount: z.number().positive("Amount must be positive"),
  units: z.number().positive("Units must be positive"),
  nav: z.number().positive("NAV must be positive"),
  /** ISO date string (YYYY-MM-DD) */
  date: z.string().min(1, "Date is required"),
});

export type CreateSipInstallmentInput = z.infer<typeof CreateSipInstallmentSchema>;

// ─── Scheme Search Result ─────────────────────────────────────────────────────

export const SchemeSearchResultSchema = z.object({
  schemeCode: z.string(),
  schemeName: z.string(),
  fundHouse: z.string().optional(),
  schemeType: z.string().optional(),
  schemeCategory: z.string().optional(),
  nav: z.number().optional(),
});

export type SchemeSearchResult = z.infer<typeof SchemeSearchResultSchema>;
