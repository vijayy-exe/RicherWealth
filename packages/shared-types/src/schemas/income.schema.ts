import { z } from "zod";

import { CurrencyCodeSchema, CuidSchema, PositiveDecimalSchema } from "./common.schema";

export const IncomeSourceTypeSchema = z.enum([
  "SALARY",
  "BUSINESS",
  "RENTAL",
  "DIVIDENDS",
  "ROYALTIES",
  "FREELANCE",
  "INTEREST",
  "AFFILIATE",
  "YOUTUBE",
  "OTHER",
]);

export type IncomeSourceType = z.infer<typeof IncomeSourceTypeSchema>;

/// ONE_TIME entries are excluded from the monthly-passive-income rollup.
export const IncomeFrequencySchema = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY", "ONE_TIME"]);

export type IncomeFrequency = z.infer<typeof IncomeFrequencySchema>;

export const IncomeBaseSchema = z.object({
  sourceType: IncomeSourceTypeSchema,
  name: z.string().min(1).max(200),
  amount: PositiveDecimalSchema,
  frequency: IncomeFrequencySchema,
  currencyCode: CurrencyCodeSchema,
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).optional(),
  details: z.record(z.unknown()).default({}),
});

export const CreateIncomeSchema = IncomeBaseSchema;
export const UpdateIncomeSchema = IncomeBaseSchema.partial();

export const IncomeSchema = IncomeBaseSchema.extend({
  id: CuidSchema,
  userId: CuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type Income = z.infer<typeof IncomeSchema>;
export type CreateIncomeInput = z.infer<typeof CreateIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof UpdateIncomeSchema>;
