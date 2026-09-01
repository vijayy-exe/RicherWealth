import { z } from "zod";

// ─── Bond Holding ─────────────────────────────────────────────────────────────

export const BondTypeSchema = z.enum(["GOVT", "CORPORATE", "MUNICIPAL", "SGB"]);
export type BondTypeValue = z.infer<typeof BondTypeSchema>;

export const CreateBondHoldingSchema = z.object({
  issuer: z.string().min(1, "Issuer is required"),
  bondType: BondTypeSchema.default("CORPORATE"),
  /** Face value per bond (₹1000 for most Indian govt bonds) */
  faceValue: z.number().positive("Face value must be positive"),
  /** Annual coupon rate in % e.g. 7.25 */
  couponRate: z.number().min(0).max(100, "Coupon rate must be 0–100%"),
  maturityDate: z.string().min(1, "Maturity date is required"),
  quantityHeld: z.number().int().positive("Quantity must be a positive integer"),
  purchasePrice: z.number().positive().optional(),
  purchaseDate: z.string().optional(),
  isin: z.string().optional(),
  currencyCode: z.string().default("INR"),
});

export type CreateBondHoldingInput = z.infer<typeof CreateBondHoldingSchema>;

// ─── ETF Holding ──────────────────────────────────────────────────────────────
// ETFs reuse the stock schema shape on the frontend but have a dedicated backend model

export const CreateEtfHoldingSchema = z.object({
  ticker: z.string().min(1).max(20).toUpperCase(),
  exchange: z.enum(["NSE", "BSE", "NYSE", "NASDAQ", "LSE", "HKEX", "ASX", "TSX", "OTHER"]),
  unitsHeld: z.number().positive("Units must be positive"),
  avgBuyPrice: z.number().positive("Buy price must be positive"),
  currency: z.string().default("INR"),
  name: z.string().optional(),
  purchaseDate: z.string().optional(),
});

export type CreateEtfHoldingInput = z.infer<typeof CreateEtfHoldingSchema>;
