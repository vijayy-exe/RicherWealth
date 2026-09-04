// RicherWealth Shared Types — Phase 0–5
// Zod schemas shared between apps/web (frontend validation) and apps/api (DTO validation).
// Every new asset type added in any phase MUST have a Zod schema here first.

export * from "./schemas/asset.schema";
export * from "./schemas/liability.schema";
export * from "./schemas/transaction.schema";
export * from "./schemas/user.schema";
export * from "./schemas/common.schema";
export * from "./schemas/auth.schema";
// Phase 5
export * from "./schemas/mutual-fund.schema";
export * from "./schemas/bond.schema";
export * from "./schemas/crypto.schema";
// Phase 9 — loan amortization engine (shared with apps/web for the live prepayment slider)
export * from "./calc/amortization";
// Phase 10 — income tracking, expense/bank-sync
export * from "./schemas/income.schema";
export * from "./calc/recurring-amount";
// Phase 13 — goals module + calculator suite (SIP/Lumpsum/CompoundInterest/
// RD/FD reuse compound-growth.ts; EMI/Mortgage/Loan Comparison reuse
// amortization.ts/mortgage.ts; Goal Planning reuses compound-growth.ts's
// reverse solves)
export * from "./calc/compound-growth";
export * from "./calc/swp";
export * from "./calc/inflation";
export * from "./calc/retirement";
export * from "./calc/tax";
export * from "./calc/currency";
export * from "./calc/mortgage";
