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
// Phase 14 — market intelligence & news (types + pure dedup/relevance logic,
// shared so apps/api's NewsService and apps/web's Markets page never drift)
export * from "./market-intel/types";
export * from "./market-intel/dedup";
export * from "./market-intel/relevance";
// Phase 15 — tax center: versioned per-country config (add a country by
// adding a JSON file, not touching calc code) + pure FIFO/capital-gains/
// harvesting logic, shared between apps/api's authoritative TaxService and
// any frontend "what if I sell this" preview.
export * from "./tax-config";
export * from "./calc/capital-gains";
export * from "./tax/types";
// Phase 15 extension — ITR document upload & analysis: FieldWithConfidence-
// wrapped parsed data, the schema-driven ITR-1/2/3/4 text parser (shared by
// both the pdf-parse and tesseract.js OCR extraction paths), and the
// read-only ITR-vs-tracked-data discrepancy comparison.
export * from "./tax/itr-types";
export * from "./tax/itr-parser";
export * from "./tax/itr-discrepancy";
export * from "./tax-config/schema";
// Phase 16 — zero-knowledge encrypted document vault: pure isomorphic
// AES-256-GCM + PBKDF2 crypto (browser-usable, Node/Jest-testable) and
// shared DTOs/category rules. apps/api never imports ./vault/crypto —
// the server only ever stores/serves ciphertext + metadata.
export * from "./vault/crypto";
export * from "./vault/types";
