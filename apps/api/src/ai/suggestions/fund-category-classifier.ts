import { FUND_CATEGORY_BENCHMARKS } from "./fund-category-benchmarks.data";

/**
 * Pure, deterministic keyword classifier — no I/O, no LLM. `MutualFundHolding`
 * has no `category` column, so this is a documented, honest heuristic
 * substitute: a fund whose name matches no keyword set returns `null` and
 * is excluded from every Opportunity Scanner check that needs a category,
 * rather than being guessed at.
 */
export function classifyFundCategory(fundName: string): string | null {
  const lower = fundName.toLowerCase();
  for (const row of FUND_CATEGORY_BENCHMARKS) {
    if (row.keywords.some((kw) => lower.includes(kw))) return row.category;
  }
  return null;
}
