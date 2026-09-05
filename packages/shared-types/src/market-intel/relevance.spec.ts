import { tagArticleRelevance, buildPersonalizedFeed, type HoldingKeyword } from "./relevance";
import type { RawNewsArticle, NewsArticle } from "./types";

const HOLDINGS: HoldingKeyword[] = [
  { label: "AAPL", keywords: ["AAPL", "Apple"] },
  { label: "Bitcoin", keywords: ["BTC", "Bitcoin"] },
];

function baseArticle(overrides: Partial<Omit<NewsArticle, "matchedHoldings" | "isPersonalized">>) {
  return {
    source: "newsapi",
    title: "Untitled",
    description: null,
    url: "https://example.com",
    imageUrl: null,
    publishedAt: "2026-09-04T10:00:00Z",
    mergedSources: ["newsapi"],
    ...overrides,
  };
}

describe("tagArticleRelevance", () => {
  it("matches a holding mentioned in the title", () => {
    const article = baseArticle({ title: "Apple Reports Record iPhone Sales" });
    const tagged = tagArticleRelevance(article, HOLDINGS);
    expect(tagged.matchedHoldings).toEqual(["AAPL"]);
    expect(tagged.isPersonalized).toBe(true);
  });

  it("matches a holding mentioned only in the description", () => {
    const article = baseArticle({
      title: "Tech Stocks Rally",
      description: "Bitcoin and other crypto assets also gained.",
    });
    const tagged = tagArticleRelevance(article, HOLDINGS);
    expect(tagged.matchedHoldings).toEqual(["Bitcoin"]);
  });

  it("does not match on a substring inside an unrelated word (whole-word only)", () => {
    // "BTC" should not match inside an unrelated token like "subtcategory".
    const article = baseArticle({ title: "New Subtcategory Rules Announced" });
    const tagged = tagArticleRelevance(article, HOLDINGS);
    expect(tagged.matchedHoldings).toEqual([]);
    expect(tagged.isPersonalized).toBe(false);
  });

  it("returns no matches for an article about none of the user's holdings", () => {
    const article = baseArticle({ title: "Gold Prices Hit Record High" });
    const tagged = tagArticleRelevance(article, HOLDINGS);
    expect(tagged.matchedHoldings).toEqual([]);
    expect(tagged.isPersonalized).toBe(false);
  });
});

describe("buildPersonalizedFeed", () => {
  it("sorts articles mentioning the user's actual holdings above general market news", () => {
    const raw: RawNewsArticle[] = [
      {
        source: "gnews",
        title: "Gold Prices Hit Record High Amid Uncertainty",
        description: null,
        url: "https://a.com/gold",
        imageUrl: null,
        publishedAt: "2026-09-04T12:00:00Z", // newest
      },
      {
        source: "newsapi",
        title: "Apple Unveils New iPhone With Record Pre-Orders",
        description: null,
        url: "https://a.com/apple",
        imageUrl: null,
        publishedAt: "2026-09-04T08:00:00Z", // oldest
      },
      {
        source: "finnhub",
        title: "Oil Prices Slip on Demand Concerns",
        description: null,
        url: "https://a.com/oil",
        imageUrl: null,
        publishedAt: "2026-09-04T10:00:00Z", // middle
      },
    ];

    const feed = buildPersonalizedFeed(raw, HOLDINGS);

    expect(feed).toHaveLength(3);
    // Personalized (Apple) article is first despite being the oldest —
    // relevance beats recency for the top slot.
    expect(feed[0]!.title).toContain("Apple");
    expect(feed[0]!.isPersonalized).toBe(true);
    // Remaining general articles are newest-first.
    expect(feed[1]!.title).toContain("Gold");
    expect(feed[2]!.title).toContain("Oil");
  });
});
