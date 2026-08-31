// RicherWealth Shared Types — Phase 0
// Zod schemas shared between apps/web (frontend validation) and apps/api (DTO validation).
// Every new asset type added in any phase MUST have a Zod schema here first.

export * from "./schemas/asset.schema";
export * from "./schemas/liability.schema";
export * from "./schemas/transaction.schema";
export * from "./schemas/user.schema";
export * from "./schemas/common.schema";
export * from "./schemas/auth.schema";

