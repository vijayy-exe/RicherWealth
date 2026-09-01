import { z } from "zod";

// ─── Crypto Holding ─────────────────────────────────────────────────────────

export const CreateCryptoHoldingSchema = z.object({
  /** CoinGecko coin id, e.g. "bitcoin", "ethereum", "solana" — not the ticker symbol */
  coinId: z.string().min(1, "Coin is required"),
  symbol: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1),
  quantity: z.number().positive("Quantity must be positive"),
  avgBuyPrice: z.number().positive("Buy price must be positive"),
  currency: z.string().default("USD"),
  /** Public address only, for read-only reference — never a private key or seed phrase */
  walletAddress: z.string().optional(),
  purchaseDate: z.string().optional(),
});

export type CreateCryptoHoldingInput = z.infer<typeof CreateCryptoHoldingSchema>;

// ─── Price Alert (Phase 6: persisted only, delivery is Phase 17) ──────────────

export const PriceAlertDirectionSchema = z.enum(["ABOVE", "BELOW"]);
export type PriceAlertDirectionValue = z.infer<typeof PriceAlertDirectionSchema>;

export const CreatePriceAlertSchema = z.object({
  coinId: z.string().min(1),
  symbol: z.string().min(1).max(20).toUpperCase(),
  targetPrice: z.number().positive("Target price must be positive"),
  direction: PriceAlertDirectionSchema,
  currency: z.string().default("USD"),
});

export type CreatePriceAlertInput = z.infer<typeof CreatePriceAlertSchema>;
