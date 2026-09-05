import type { NewsArticle, RawNewsArticle } from "./types";
import { dedupeArticles } from "./dedup";

/** A single thing the user holds that news can be matched against. */
export interface HoldingKeyword {
  /** What to display back if this holding matched, e.g. "AAPL" or "Bitcoin". */
  label: string;
  /** All strings that count as a match for this holding — ticker, company name, coin symbol/name. */
  keywords: string[];
}

/**
 * Tags an article with which of the user's holdings it mentions, by
 * whole-word (not substring) matching each holding's keywords against the
 * article's title + description. Whole-word matching avoids false positives
 * like a "GOOGL" ticker keyword matching inside an unrelated word.
 */
export function tagArticleRelevance(
  article: Omit<NewsArticle, "matchedHoldings" | "isPersonalized">,
  holdings: HoldingKeyword[],
): NewsArticle {
  const haystack = `${article.title} ${article.description ?? ""}`.toLowerCase();
  const matched = new Set<string>();

  for (const holding of holdings) {
    for (const keyword of holding.keywords) {
      const trimmed = keyword.trim();
      if (trimmed.length < 2) continue;
      const pattern = new RegExp(`\\b${escapeRegExp(trimmed.toLowerCase())}\\b`);
      if (pattern.test(haystack)) {
        matched.add(holding.label);
        break;
      }
    }
  }

  return {
    ...article,
    matchedHoldings: Array.from(matched),
    isPersonalized: matched.size > 0,
  };
}

/**
 * Full pipeline: dedupe raw multi-provider articles, tag each for
 * portfolio relevance, then sort personalized-first (each group internally
 * newest-first) — the shape the "News relevant to your portfolio" section
 * and the general feed both read directly.
 */
export function buildPersonalizedFeed(raw: RawNewsArticle[], holdings: HoldingKeyword[]): NewsArticle[] {
  const deduped = dedupeArticles(raw);
  const tagged = deduped.map((a) => tagArticleRelevance(a, holdings));
  return tagged.sort((a, b) => {
    if (a.isPersonalized !== b.isPersonalized) return a.isPersonalized ? -1 : 1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
