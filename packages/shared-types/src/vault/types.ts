import { z } from "zod";

export const VAULT_DOCUMENT_CATEGORIES = [
  "PAN",
  "AADHAAR",
  "PASSPORT",
  "INSURANCE",
  "PROPERTY_DOCUMENTS",
  "INVESTMENT_STATEMENTS",
  "TAX_RETURNS",
  "WILL_TRUST",
] as const;

export type VaultDocumentCategory = (typeof VAULT_DOCUMENT_CATEGORIES)[number];

export const vaultDocumentCategorySchema = z.enum(VAULT_DOCUMENT_CATEGORIES);

/**
 * Only categories that map to a real, meaningful RicherWealth record can
 * carry an optional linkedAssetId — PAN/Aadhaar/Passport are identity
 * documents with no natural Asset to link to, and there is no Insurance
 * Prisma model in this app (confirmed by grep), so INSURANCE is
 * category-tagged only, same as the identity documents. Property Documents
 * and Investment Statements can meaningfully reference an existing Asset.
 * Tax Returns intentionally stays standalone here too — a document
 * uploaded to the vault is a scan for safekeeping, distinct from the
 * Phase 15 ITR extension's own structured ItrDocument pipeline; linking
 * the two would conflate "a PDF in a folder" with "a parsed, reviewed tax
 * return" and there's no product need to merge them.
 */
export const ASSET_LINKABLE_VAULT_CATEGORIES: ReadonlySet<VaultDocumentCategory> = new Set([
  "PROPERTY_DOCUMENTS",
  "INVESTMENT_STATEMENTS",
]);

export function categorySupportsAssetLink(category: VaultDocumentCategory): boolean {
  return ASSET_LINKABLE_VAULT_CATEGORIES.has(category);
}

export const VAULT_CATEGORY_LABELS: Record<VaultDocumentCategory, string> = {
  PAN: "PAN Card",
  AADHAAR: "Aadhaar",
  PASSPORT: "Passport",
  INSURANCE: "Insurance",
  PROPERTY_DOCUMENTS: "Property Documents",
  INVESTMENT_STATEMENTS: "Investment Statements",
  TAX_RETURNS: "Tax Returns",
  // Phase 21: wills/trust deeds link to a Household (linkedHouseholdId),
  // not an Asset — see linkedAssetId's doc comment above.
  WILL_TRUST: "Will / Trust Documents",
};

export interface VaultDocumentDto {
  id: string;
  category: VaultDocumentCategory;
  storagePath: string;
  encryptedFilename: string; // base64 ciphertext — decrypt client-side to display
  encryptedFilenameIv: string;
  mimeType: string;
  fileSizeBytes: number;
  iv: string; // base64 — the file content's own AES-GCM nonce
  linkedAssetId: string | null;
  linkedHouseholdId: string | null;
  createdAt: string;
}

export interface VaultSaltResponse {
  saltB64: string | null; // null = vault not set up yet for this user
  hasCanary: boolean;
}

export const setupVaultSchema = z.object({
  saltB64: z.string().min(1),
  canaryB64: z.string().min(1),
  canaryIvB64: z.string().min(1),
});
export type SetupVaultDto = z.infer<typeof setupVaultSchema>;

export const requestVaultUploadSchema = z.object({
  filename: z.string().min(1), // used only to infer a safe random storage-path suffix; never stored in the clear
  mimeType: z.string().min(1),
});
export type RequestVaultUploadDto = z.infer<typeof requestVaultUploadSchema>;

export const registerVaultDocumentSchema = z.object({
  category: vaultDocumentCategorySchema,
  storagePath: z.string().min(1),
  encryptedFilename: z.string().min(1),
  encryptedFilenameIv: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  iv: z.string().min(1),
  linkedAssetId: z.string().nullable().optional(),
  linkedHouseholdId: z.string().nullable().optional(),
});
export type RegisterVaultDocumentDto = z.infer<typeof registerVaultDocumentSchema>;
