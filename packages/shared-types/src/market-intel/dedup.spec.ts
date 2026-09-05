import { dedupeArticles, titleSimilarity } from "./dedup";
import type { RawNewsArticle } from "./types";

function article(overrides: Partial<RawNewsArticle>): RawNewsArticle {
  return {
    source: "newsapi",
    title: "Untitled",
    description: null,
    url: "https://example.com/a",
    imageUrl: null,
    publishedAt: "2026-09-04T10:00:00Z",
    ...overrides,
  };
}

describe("titleSimilarity", () => {
  it("scores real-world-style near-duplicate headlines (same wire story, lightly re-edited by different outlets) highly", () => {
    const a = "Fed Holds Interest Rates Steady, Signals Cuts Ahead";
    const b = "Fed Holds Rates Steady but Signals Rate Cuts Ahead";
    expect(titleSimilarity(a, b)).toBeGreaterThanOrEqual(0.5);
  });

  it("scores unrelated headlines low", () => {
    const a = "Fed Holds Interest Rates Steady, Signals Cuts Ahead";
    const b = "Apple Unveils New iPhone With Improved Camera";
    expect(titleSimilarity(a, b)).toBeLessThan(0.3);
  });
});

describe("dedupeArticles", () => {
  it("collapses near-identical headlines about the same story from different sources into one article", () => {
    const raw: RawNewsArticle[] = [
      article({
        source: "newsapi",
        title: "RBI Cuts Repo Rate by 25 Basis Points",
        description: "The RBI's Monetary Policy Committee voted to lower rates.",
        url: "https://outlet-a.com/rbi-cut",
        imageUrl: "https://outlet-a.com/img.jpg",
        publishedAt: "2026-09-04T09:00:00Z",
      }),
      article({
        source: "gnews",
        title: "RBI Cuts Repo Rate 25 Basis Points in Surprise Move",
        description: null,
        url: "https://outlet-b.com/rbi-cut",
        publishedAt: "2026-09-04T09:05:00Z",
      }),
      article({
        source: "finnhub",
        title: "Reliance Industries Reports Record Quarterly Profit",
        description: "Reliance beat analyst estimates for Q2.",
        url: "https://outlet-c.com/reliance",
        publishedAt: "2026-09-04T08:00:00Z",
      }),
    ];

    const result = dedupeArticles(raw);

    expect(result).toHaveLength(2);

    const rbiArticle = result.find((a) => a.title.toLowerCase().includes("repo rate"))!;
    expect(rbiArticle).toBeDefined();
    expect(rbiArticle.mergedSources.sort()).toEqual(["gnews", "newsapi"]);
    // Richer article (has description + image) is kept as the representative.
    expect(rbiArticle.source).toBe("newsapi");
    expect(rbiArticle.description).not.toBeNull();

    const relianceArticle = result.find((a) => a.title.includes("Reliance"))!;
    expect(relianceArticle.mergedSources).toEqual(["finnhub"]);
  });

  it("keeps genuinely distinct stories separate", () => {
    const raw: RawNewsArticle[] = [
      article({ title: "US GDP Grows 2.8% in Second Quarter", url: "https://a.com/1" }),
      article({ title: "Bitcoin Surges Past $70,000 on ETF Inflows", url: "https://a.com/2" }),
      article({ title: "Gold Prices Hit Record High Amid Uncertainty", url: "https://a.com/3" }),
    ];
    expect(dedupeArticles(raw)).toHaveLength(3);
  });
});
