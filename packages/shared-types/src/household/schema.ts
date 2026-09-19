import { z } from "zod";
import { HouseholdRoleSchema, type HouseholdRole as HouseholdRoleValue } from "../schemas/user.schema";

// Reuses Phase 1's HouseholdRoleSchema/HouseholdRole (packages/shared-types/
// src/schemas/user.schema.ts) rather than redefining the OWNER/MEMBER/VIEWER
// enum a second time.
export { HouseholdRoleSchema as householdRoleSchema };
export type { HouseholdRoleValue };

export const createHouseholdSchema = z.object({
  name: z.string().min(1).max(120),
});
export type CreateHouseholdDto = z.infer<typeof createHouseholdSchema>;

export const addHouseholdMemberSchema = z.object({
  email: z.string().email(),
  role: HouseholdRoleSchema.default("MEMBER"),
});
export type AddHouseholdMemberDto = z.infer<typeof addHouseholdMemberSchema>;

export const updateHouseholdMemberRoleSchema = z.object({
  role: HouseholdRoleSchema,
});
export type UpdateHouseholdMemberRoleDto = z.infer<typeof updateHouseholdMemberRoleSchema>;

export interface HouseholdMemberDto {
  userId: string;
  name: string | null;
  email: string;
  role: HouseholdRoleValue;
  joinedAt: string;
}

export interface HouseholdDto {
  id: string;
  name: string;
  baseCurrency: string;
  members: HouseholdMemberDto[];
  createdAt: string;
}

export interface HouseholdNetWorthDto {
  householdId: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  baseCurrency: string;
  memberCount: number;
}
