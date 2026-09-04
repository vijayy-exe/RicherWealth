import { z } from "zod";

import { CurrencyCodeSchema, CuidSchema, NonNegativeDecimalSchema } from "./common.schema";

export const TransactionTypeSchema = z.enum([
  "buy",
  "sell",
  "dividend",
  "income",
  "expense",
  "transfer",
  "emi",
  "deposit",
  "withdrawal",
]);

export const TransactionSourceSchema = z.enum(["manual", "bank_sync", "csv_import", "pdf_import"]);

/// Phase 10 — the auto-categorization rules engine assigns one of these to
/// every expense transaction; OTHER is the low-confidence fallback that also
/// sets needsCategoryReview.
export const ExpenseCategorySchema = z.enum([
  "TRAVEL",
  "SHOPPING",
  "FOOD",
  "UTILITIES",
  "HEALTHCARE",
  "ENTERTAINMENT",
  "SUBSCRIPTIONS",
  "BILLS",
  "OTHER",
]);

export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const TransactionBaseSchema = z.object({
  type: TransactionTypeSchema,
  amount: NonNegativeDecimalSchema,
  currencyCode: CurrencyCodeSchema,
  date: z.string().datetime(),
  assetId: CuidSchema.optional(),
  liabilityId: CuidSchema.optional(),
  quantity: z.number().positive().optional(),
  pricePerUnit: z.number().positive().optional(),
  category: z.string().max(100).optional(),
  merchant: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  source: TransactionSourceSchema.default("manual"),
  externalId: z.string().max(200).optional(),
  needsCategoryReview: z.boolean().default(false),
  details: z.record(z.unknown()).default({}),
});

export const CreateTransactionSchema = TransactionBaseSchema;

export const TransactionSchema = TransactionBaseSchema.extend({
  id: CuidSchema,
  userId: CuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
