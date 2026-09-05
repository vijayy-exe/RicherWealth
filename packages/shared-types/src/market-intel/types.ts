/**
 * Phase 14 — Market Intelligence & News. Types shared between apps/api
 * (producer) and apps/web (consumer) so the Markets page never has to
 * hand-roll a second copy of these shapes.
 */

export interface MarketQuote {
  symbol: string;
  label: string; // display name, e.g. "S&P 500", "Bitcoin", "Gold"
  price: number;
  previousClose: number | null;
  changePct: number | null; // (price - previousClose) / previousClose * 100
  currency: string;
  provider: string;
  fetchedAt: string;
  isStale: boolean;
}

export interface HoldingMoverQuote extends MarketQuote {
  /** The user's own ticker/coinId this quote is for. */
  holdingId: string;
}

export interface EconomicIndicator {
  key: "FED_FUNDS_RATE" | "RBI_REPO_RATE" | "US_INFLATION_CPI" | "US_GDP_GROWTH";
  label: string;
  valuePct: number;
  isLive: boolean;
  /** Only false for the RBI repo rate today — see rbi-rate.service.ts. */
  fetchedAt: string;
}

export interface IpoListingDto {
  id: string;
  companyName: string;
  exchange: string;
  expectedDate: string | null;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  currency: string;
  status: "UPCOMING" | "OPEN" | "CLOSED" | "LISTED" | "WITHDRAWN";
  notes: string | null;
  createdAt: string;
}

/** A single article as returned by any one provider, before dedup/tagging. */
export interface RawNewsArticle {
  source: string; // e.g. "newsapi", "gnews", "finnhub"
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string; // ISO
}

/** A deduplicated, relevance-tagged article as served to the frontend. */
export interface NewsArticle extends RawNewsArticle {
  /** Sources whose near-duplicate articles were collapsed into this one. */
  mergedSources: string[];
  /** Tickers/coin ids/company names from the user's holdings matched in the title/description. */
  matchedHoldings: string[];
  /** matchedHoldings.length > 0 */
  isPersonalized: boolean;
}
