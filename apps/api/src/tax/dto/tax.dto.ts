import { z } from "zod";

// ─── Record a buy lot ─────────────────────────────────────────────────────────
export const recordLotSchema = z.object({
  holdingType: z.enum(["STOCK", "MUTUAL_FUND", "CRYPTO"]),
  assetId:     z.string().optional(),
  ticker:      z.string().min(1),   // ticker / coinId / schemeCode
  displayName: z.string().min(1),
  quantity:    z.number().positive(),
  costBasisPerUnit:  z.number().positive(),
  costBasisCurrency: z.string().length(3),
  acquiredAt:  z.string(),          // ISO date string — validated in service
});
export type RecordLotDto = z.infer<typeof recordLotSchema>;

// ─── Dispose (sell) from a lot ───────────────────────────────────────────────
export const disposeLotSchema = z.object({
  quantity:         z.number().positive(),
  proceedsPerUnit:  z.number().positive(),
  proceedsCurrency: z.string().length(3),
  disposedAt:       z.string(),
  notes:            z.string().optional(),
});
export type DisposeLotDto = z.infer<typeof disposeLotSchema>;

// ─── Record dividend income ───────────────────────────────────────────────────
export const recordDividendSchema = z.object({
  ticker:      z.string().min(1),
  displayName: z.string().min(1),
  holdingType: z.enum(["STOCK", "MUTUAL_FUND", "CRYPTO"]),
  amount:      z.number().positive(),
  currencyCode: z.string().length(3),
  receivedAt:  z.string(),
  notes:       z.string().optional(),
});
export type RecordDividendDto = z.infer<typeof recordDividendSchema>;
