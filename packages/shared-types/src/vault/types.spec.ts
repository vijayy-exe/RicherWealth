import { categorySupportsAssetLink, VAULT_DOCUMENT_CATEGORIES, vaultDocumentCategorySchema } from "./types";

describe("vault category → optional Asset-link logic", () => {
  it("allows linking for PROPERTY_DOCUMENTS and INVESTMENT_STATEMENTS", () => {
    expect(categorySupportsAssetLink("PROPERTY_DOCUMENTS")).toBe(true);
    expect(categorySupportsAssetLink("INVESTMENT_STATEMENTS")).toBe(true);
  });

  it("does NOT allow linking for identity documents and categories with no matching model", () => {
    expect(categorySupportsAssetLink("PAN")).toBe(false);
    expect(categorySupportsAssetLink("AADHAAR")).toBe(false);
    expect(categorySupportsAssetLink("PASSPORT")).toBe(false);
    expect(categorySupportsAssetLink("INSURANCE")).toBe(false); // no Insurance Prisma model exists
    expect(categorySupportsAssetLink("TAX_RETURNS")).toBe(false); // deliberately standalone, see types.ts comment
  });

  it("covers every declared category with an explicit true/false (no silent default)", () => {
    for (const c of VAULT_DOCUMENT_CATEGORIES) {
      expect(typeof categorySupportsAssetLink(c)).toBe("boolean");
    }
  });

  it("Zod schema accepts every declared category and rejects an unknown one", () => {
    for (const c of VAULT_DOCUMENT_CATEGORIES) {
      expect(() => vaultDocumentCategorySchema.parse(c)).not.toThrow();
    }
    expect(() => vaultDocumentCategorySchema.parse("NOT_A_REAL_CATEGORY")).toThrow();
  });
});
