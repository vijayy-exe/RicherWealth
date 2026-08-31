import { z } from "zod";

import { CuidSchema } from "./common.schema";

export const HouseholdRoleSchema = z.enum(["OWNER", "MEMBER", "VIEWER"]);

export const UserSchema = z.object({
  id: CuidSchema,
  email: z.string().email(),
  name: z.string().max(200).optional(),
  avatarUrl: z.string().url().optional(),
  baseCurrency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  mfaEnabled: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UpdateUserSchema = z.object({
  name: z.string().max(200).optional(),
  baseCurrency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
});

export type User = z.infer<typeof UserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type HouseholdRole = z.infer<typeof HouseholdRoleSchema>;
