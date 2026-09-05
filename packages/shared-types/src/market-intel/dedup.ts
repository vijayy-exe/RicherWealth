import type { NewsArticle, RawNewsArticle } from "./types";

/**
 * Near-duplicate headline collapsing for Phase 14's news aggregation.
 * Real-world outlets rarely publish byte-identical headlines for the same
 * story ("Fed Holds Rates Steady" vs "Federal Reserve Keeps Interest Rates
 * Unchanged") — exact-string dedup would miss almost everything, so this
 * uses Jaccard similarity over normalized title tokens (lowercased,
 * punctuation stripped, stopwords removed) as a cheap, dependency-free
 * fuzzy match. Two articles collapse into one when their similarity is at
 * or above SIMILARITY_THRESHOLD.
 *
 * Pure function, no I/O — shared so both a future frontend dedup pass (if
 * ever needed) and apps/api's NewsService import the exact same logic.
 */

export const SIMILARITY_THRESHOLD = 0.5;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "as", "is", "are", "was", "were", "be", "been", "by", "from",
  "its", "it", "this", "that", "after", "over", "amid", "says", "up",
  "down", "into", "than", "vs",
]);

export function normalizeTitleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function titleSimilarity(titleA: string, titleB: string): number {
  return jaccardSimilarity(normalizeTitleTokens(titleA), normalizeTitleTokens(titleB));
}

/**
 * Groups near-identical articles (by title similarity) and collapses each
 * group into one `NewsArticle`, keeping the article with the richest
 * content (has a description + image, then earliest publishedAt as a
 * tiebreak) as the representative, and recording every source that carried
 * a version of the story in `mergedSources`.
 */
export function dedupeArticles(articles: RawNewsArticle[]): Omit<NewsArticle, "matchedHoldings" | "isPersonalized">[] {
  const groups: RawNewsArticle[][] = [];

  for (const article of articles) {
    const tokens = normalizeTitleTokens(article.title);
    let placed = false;
    for (const group of groups) {
      const repTokens = normalizeTitleTokens(group[0]!.title);
      if (jaccardSimilarity(tokens, repTokens) >= SIMILARITY_THRESHOLD) {
        group.push(article);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([article]);
  }

  return groups.map((group) => {
    const representative = [...group].sort((a, b) => richnessScore(b) - richnessScore(a))[0]!;
    return {
      ...representative,
      mergedSources: Array.from(new Set(group.map((a) => a.source))),
    };
  });
}

function richnessScore(article: RawNewsArticle): number {
  let score = 0;
  if (article.description && article.description.length > 0) score += 2;
  if (article.imageUrl) score += 1;
  return score;
}
