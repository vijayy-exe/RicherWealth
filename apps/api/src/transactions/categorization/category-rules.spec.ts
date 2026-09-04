import { categorizeMerchant, deriveKeywordFromMerchant } from "./category-rules";

describe("categorizeMerchant", () => {
  it("matches common merchants to the correct category via the seed rules", () => {
    expect(categorizeMerchant("STARBUCKS STORE #4521 SEATTLE WA")).toMatchObject({ category: "FOOD", needsReview: false });
    expect(categorizeMerchant("AMAZON.COM*1A2B3C4D")).toMatchObject({ category: "SHOPPING", needsReview: false });
    expect(categorizeMerchant("NETFLIX.COM")).toMatchObject({ category: "SUBSCRIPTIONS", needsReview: false });
    expect(categorizeMerchant("UBER TRIP HELP.UBER.COM")).toMatchObject({ category: "TRAVEL", needsReview: false });
    expect(categorizeMerchant("COMCAST CABLE COMMUNICATIO")).toMatchObject({ category: "UTILITIES", needsReview: false });
    expect(categorizeMerchant("CVS PHARMACY #3311")).toMatchObject({ category: "HEALTHCARE", needsReview: false });
    expect(categorizeMerchant("AMC THEATRES ONLINE")).toMatchObject({ category: "ENTERTAINMENT", needsReview: false });
    expect(categorizeMerchant("GEICO INSURANCE")).toMatchObject({ category: "BILLS", needsReview: false });
  });

  it("is case-insensitive", () => {
    expect(categorizeMerchant("starbucks store")).toMatchObject({ category: "FOOD" });
  });

  it("falls back to OTHER with needsReview when nothing matches", () => {
    const result = categorizeMerchant("QZX7 UNKNOWN MERCHANT 99");
    expect(result.category).toBe("OTHER");
    expect(result.needsReview).toBe(true);
  });

  it("treats an empty merchant as needing review", () => {
    expect(categorizeMerchant("   ")).toEqual({ category: "OTHER", needsReview: true });
  });

  it("prefers a user's learned rule over the seed default", () => {
    // Seed rules have no opinion on "joe's corner bodega" — a user-specific
    // correction should be picked up and win even where a seed rule also matches.
    const result = categorizeMerchant("JOE'S CORNER BODEGA", [{ keyword: "joe's corner", category: "FOOD" }]);
    expect(result).toMatchObject({ category: "FOOD", needsReview: false, matchedKeyword: "joe's corner" });
  });

  it("prefers the longer/more specific keyword match when several match", () => {
    // "uber eats" (FOOD) should win over the shorter generic "uber" (TRAVEL) when both are present.
    const result = categorizeMerchant("UBER EATS ORDER #123");
    expect(result.category).toBe("FOOD");
  });
});

describe("deriveKeywordFromMerchant", () => {
  it("extracts the leading brand-like token", () => {
    expect(deriveKeywordFromMerchant("STARBUCKS #4521 SEATTLE WA")).toBe("starbucks");
    expect(deriveKeywordFromMerchant("JOE'S CORNER BODEGA")).toBe("joe's");
  });

  it("falls back to the full lowercased string when there's no clean leading token", () => {
    expect(deriveKeywordFromMerchant("99")).toBe("99");
  });
});
