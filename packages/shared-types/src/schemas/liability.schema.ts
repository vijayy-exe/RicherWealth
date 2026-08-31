import { z } from "zod";

import {
  AnnualRateSchema,
  CurrencyCodeSchema,
  CuidSchema,
  NonNegativeDecimalSchema,
  PositiveDecimalSchema,
} from "./common.schema";

export const LiabilityTypeSchema = z.enum([
  "MORTGAGE",
  "CAR_LOAN",
  "EDUCATION_LOAN",
  "PERSONAL_LOAN",
  "CREDIT_CARD",
  "OTHER",
]);

export type LiabilityType = z.infer<typeof LiabilityTypeSchema>;

export const LiabilityBaseSchema = z.object({
  type: LiabilityTypeSchema,
  name: z.string().min(1).max(200),
  principalAmount: PositiveDecimalSchema,
  remainingBalance: NonNegativeDecimalSchema,
  interestRate: AnnualRateSchema,
  currencyCode: CurrencyCodeSchema,
  emiAmount: PositiveDecimalSchema.optional(),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  maturityDate: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  details: z.record(z.unknown()).default({}),
});

export const CreateLiabilitySchema = LiabilityBaseSchema;
export const UpdateLiabilitySchema = LiabilityBaseSchema.partial();

export const LiabilitySchema = LiabilityBaseSchema.extend({
  id: CuidSchema,
  userId: CuidSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type Liability = z.infer<typeof LiabilitySchema>;
export type CreateLiabilityInput = z.infer<typeof CreateLiabilitySchema>;
export type UpdateLiabilityInput = z.infer<typeof UpdateLiabilitySchema>;
