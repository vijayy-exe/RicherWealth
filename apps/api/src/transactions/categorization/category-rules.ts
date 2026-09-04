import type { ExpenseCategory } from "@richer/shared-types";

/**
 * Auto-categorization rules engine — merchant-keyword matching. Free, fast,
 * good enough for v1 (per PROJECT_CONTEXT: "start with a rules engine before
 * reaching for ML"). Two layers, checked in order:
 *
 *   1. Per-user learned rules (packages/... no — DB `CategoryRule` rows,
 *      created automatically whenever a user corrects a low-confidence
 *      match). Takes priority: a user's own correction always beats the
 *      global default for their transactions.
 *   2. This file's static SEED_RULES — a generous default keyword map
 *      covering common merchants across all 8 categories, tuned against a
 *      realistic sample statement (see bank-sync/providers/csv-import.service.spec.ts).
 *
 * No match in either layer => category "OTHER" with low confidence, logged
 * via `needsCategoryReview` for the user to correct — that correction is
 * what feeds layer 1 next time.
 */

export interface UserCategoryRule {
  keyword: string;
  category: ExpenseCategory;
}

export interface CategorizationResult {
  category: ExpenseCategory;
  /** True when no rule matched (fell back to OTHER) — surfaced to the user as a review item. */
  needsReview: boolean;
  /** The keyword that matched, for debugging/audit — undefined when needsReview is true. */
  matchedKeyword?: string;
}

// Keywords are matched as case-insensitive substrings against the merchant
// name. Order within a category doesn't matter; longest-keyword-wins across
// categories when more than one matches (e.g. "whole foods market" matches
// both a generic "market" food keyword and the specific "whole foods" one —
// the more specific, longer keyword should win).
const SEED_RULES: Record<Exclude<ExpenseCategory, "OTHER">, string[]> = {
  TRAVEL: [
    "uber", "lyft", "airbnb", "expedia", "booking.com", "makemytrip", "yatra.com",
    "delta air", "united airlines", "american airlines", "southwest air", "jetblue",
    "ryanair", "easyjet", "indigo", "spicejet", "vistara", "air india", "emirates",
    "marriott", "hilton", "hyatt", "holiday inn", "taj hotels", "oyo rooms",
    "hertz", "avis", "enterprise rent", "irctc", "ola cabs", "rapido",
  ],
  SHOPPING: [
    "amazon", "walmart", "target", "ebay", "etsy", "best buy", "ikea", "costco",
    "flipkart", "myntra", "ajio", "nykaa", "zara", "h&m", "nike", "adidas",
    "macy's", "nordstrom", "aliexpress", "shein", "home depot", "lowe's",
  ],
  FOOD: [
    "starbucks", "mcdonald", "chipotle", "subway", "domino", "pizza hut", "kfc",
    "taco bell", "dunkin", "chick-fil-a", "doordash", "ubereats", "uber eats",
    "grubhub", "swiggy", "zomato", "whole foods", "trader joe", "kroger",
    "safeway", "cafe coffee day", "starbucks coffee", "panera", "wendy's",
    "burger king", "five guys", "olive garden", "cheesecake factory", "grocery",
  ],
  UTILITIES: [
    "electric company", "electricity board", "con edison", "pg&e", "national grid",
    "comcast", "xfinity", "at&t", "verizon", "t-mobile", "spectrum internet",
    "bses", "tata power", "adani electricity", "broadband", "water utility",
    "gas company", "reliance jio", "airtel",
  ],
  HEALTHCARE: [
    "cvs pharmacy", "walgreens", "rite aid", "hospital", "medical center",
    "dental", "urgent care", "labcorp", "quest diagnostics", "apollo pharmacy",
    "practo", "clinic", "pharmacy", "health insurance",
  ],
  ENTERTAINMENT: [
    "amc theatres", "regal cinemas", "cinemark", "ticketmaster", "stubhub",
    "pvr cinemas", "inox", "bookmyshow", "six flags", "disneyland", "universal studios",
    "steam games", "playstation store", "xbox live", "nintendo eshop", "bowling",
  ],
  SUBSCRIPTIONS: [
    "netflix", "spotify", "hulu", "disney+", "disney plus", "hbo max", "hbomax",
    "amazon prime", "apple music", "apple.com/bill", "youtube premium", "adobe",
    "microsoft 365", "dropbox", "icloud", "github", "notion", "openai", "chatgpt",
    "hotstar", "jiocinema", "audible",
  ],
  BILLS: [
    "rent payment", "mortgage pymt", "insurance premium", "geico", "state farm",
    "progressive ins", "allstate", "phone bill", "credit card payment",
    "loan payment", "emi payment", " lic ", "hdfc life", "electric bill",
  ],
};

const CATEGORY_ORDER = Object.keys(SEED_RULES) as Array<keyof typeof SEED_RULES>;

function findLongestMatch(
  merchantLower: string,
  rules: Array<{ keyword: string; category: ExpenseCategory }>,
): { keyword: string; category: ExpenseCategory } | null {
  let best: { keyword: string; category: ExpenseCategory } | null = null;
  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase().trim();
    if (kw.length === 0) continue;
    if (merchantLower.includes(kw) && (!best || kw.length > best.keyword.length)) {
      best = { keyword: kw, category: rule.category };
    }
  }
  return best;
}

/**
 * Categorize a single merchant name. `userRules` (from the DB CategoryRule
 * table) are checked first and win over the seed map on a tie.
 */
export function categorizeMerchant(merchant: string, userRules: UserCategoryRule[] = []): CategorizationResult {
  const merchantLower = merchant.toLowerCase().trim();
  if (!merchantLower) return { category: "OTHER", needsReview: true };

  const userMatch = findLongestMatch(merchantLower, userRules);
  if (userMatch) return { category: userMatch.category, needsReview: false, matchedKeyword: userMatch.keyword };

  const seedFlat = CATEGORY_ORDER.flatMap((category) =>
    (SEED_RULES[category] ?? []).map((keyword) => ({ keyword, category: category as ExpenseCategory })),
  );
  const seedMatch = findLongestMatch(merchantLower, seedFlat);
  if (seedMatch) return { category: seedMatch.category, needsReview: false, matchedKeyword: seedMatch.keyword };

  return { category: "OTHER", needsReview: true };
}

/**
 * Derive a learnable keyword from a merchant name for a user correction —
 * takes the first "word" (letters/digits only, lowercased), which is
 * usually the brand name (e.g. "STARBUCKS #4521 SEATTLE WA" -> "starbucks").
 * Falls back to the full lowercased merchant string if it has no clean
 * leading token (e.g. purely numeric/symbolic descriptors).
 */
export function deriveKeywordFromMerchant(merchant: string): string {
  const match = merchant.toLowerCase().match(/[a-z][a-z0-9&.'-]{2,}/);
  return match ? match[0] : merchant.toLowerCase().trim();
}
