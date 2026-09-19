/**
 * Phase 20 — Opportunity Scanner. Curated reference table of typical
 * expense ratios and dividend yields by broad mutual-fund category, for
 * India's fund market (matching this app's INR/MFAPI.in-scheme-code
 * orientation elsewhere). Manually maintained, not live-fetched — same
 * "no free, reliable data source exists for this" precedent as
 * `ipo-listing.service.ts` (Phase 14) and `rbi-rate.service.ts` — figures
 * are rough industry-typical midpoints as of 2026, meant to catch GROSSLY
 * outlying holdings, not to be a precise fee-comparison tool. Seeded into
 * the `FundCategoryBenchmark` table on `SuggestionEngineService.onModuleInit`
 * (idempotent upsert on the unique `category` field).
 *
 * `MutualFundHolding` has no `category` column (confirmed: only
 * schemeCode/fundName/investmentType/expenseRatio exist), so
 * `fund-category-classifier.ts`'s `classifyFundCategory` matches a fund's
 * free-text `fundName` against `keywords` here, FIRST MATCH WINS — ordered
 * from most to least specific so e.g. "ICICI Prudential Liquid Fund"
 * matches "Liquid / Money Market" before anything more generic could.
 * A fund matching no keyword set is classified `null` and excluded from
 * every Opportunity Scanner check — never guessed at.
 */

export interface FundCategoryBenchmarkRow {
  category: string;
  typicalExpenseRatioPct: number;
  typicalDividendYieldPct: number;
  exampleLowCostTicker: string | null;
  /** Case-insensitive substring match against MutualFundHolding.fundName. */
  keywords: string[];
}

export const FUND_CATEGORY_BENCHMARKS: FundCategoryBenchmarkRow[] = [
  {
    category: "Liquid / Money Market Fund",
    typicalExpenseRatioPct: 0.25,
    typicalDividendYieldPct: 6.0,
    exampleLowCostTicker: "NIPPON_LIQUID_DIRECT",
    keywords: ["liquid fund", "money market", "overnight fund"],
  },
  {
    category: "Index Fund",
    typicalExpenseRatioPct: 0.25,
    typicalDividendYieldPct: 1.2,
    exampleLowCostTicker: "UTI_NIFTY_INDEX_DIRECT",
    keywords: ["index fund", "nifty 50", "sensex", "nifty index"],
  },
  {
    category: "ELSS / Tax Saver",
    typicalExpenseRatioPct: 1.2,
    typicalDividendYieldPct: 1.0,
    exampleLowCostTicker: "PARAG_PARIKH_ELSS_DIRECT",
    keywords: ["elss", "tax saver", "tax saving"],
  },
  {
    category: "Small Cap Equity",
    typicalExpenseRatioPct: 1.6,
    typicalDividendYieldPct: 0.4,
    exampleLowCostTicker: "NIPPON_SMALLCAP_DIRECT",
    keywords: ["small cap", "smallcap"],
  },
  {
    category: "Mid Cap Equity",
    typicalExpenseRatioPct: 1.5,
    typicalDividendYieldPct: 0.6,
    exampleLowCostTicker: "MOTILAL_MIDCAP_DIRECT",
    keywords: ["mid cap", "midcap"],
  },
  {
    category: "Flexi Cap / Multi Cap Equity",
    typicalExpenseRatioPct: 1.1,
    typicalDividendYieldPct: 0.8,
    exampleLowCostTicker: "PARAG_PARIKH_FLEXICAP_DIRECT",
    keywords: ["flexi cap", "multi cap", "multicap", "flexicap"],
  },
  {
    category: "Large Cap Equity",
    typicalExpenseRatioPct: 1.0,
    typicalDividendYieldPct: 1.2,
    exampleLowCostTicker: "UTI_NIFTY_INDEX_DIRECT",
    keywords: ["large cap", "largecap", "bluechip", "blue chip"],
  },
  {
    category: "International / Global Equity",
    typicalExpenseRatioPct: 1.4,
    typicalDividendYieldPct: 0.5,
    exampleLowCostTicker: null,
    keywords: ["global", "international", "overseas", "us fund", "nasdaq"],
  },
  {
    category: "Balanced / Hybrid Fund",
    typicalExpenseRatioPct: 1.4,
    typicalDividendYieldPct: 2.5,
    exampleLowCostTicker: "ICICI_BALANCED_ADVANTAGE_DIRECT",
    keywords: ["hybrid", "balanced advantage", "balanced fund", "equity savings"],
  },
  {
    category: "Debt / Income Fund",
    typicalExpenseRatioPct: 0.6,
    typicalDividendYieldPct: 5.5,
    exampleLowCostTicker: "ICICI_SHORT_TERM_DIRECT",
    keywords: ["debt fund", "income fund", "gilt fund", "corporate bond fund", "short duration", "banking and psu"],
  },
];
