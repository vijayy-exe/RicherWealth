import { z } from "zod";

/**
 * Country-specific capital-gains/dividend tax rules, as versioned JSON
 * config (see `us.json`/`india.json`) rather than hardcoded in the
 * calculation logic — adding a new country is meant to be "drop a new JSON
 * file + register it in `TAX_CONFIGS`", never a change to
 * `capital-gains.ts`'s math.
 *
 * NOT TAX ADVICE. Rates/thresholds are simplified references for a given
 * `asOf` date (no state/local tax, no cess/surcharge, no AMT, no wash-sale
 * rule, no indexation) — the same "Not tax advice" posture the existing
 * Phase 13 Tax Calculator already documents. Real tax rules change yearly;
 * `asOf` and `source` exist so a stale config is visible, not silently wrong.
 */

export const HoldingPeriodRuleSchema = z.object({
  /** TaxHoldingType this rule applies to: "STOCK" | "MUTUAL_FUND" | "CRYPTO". */
  holdingType: z.enum(["STOCK", "MUTUAL_FUND", "CRYPTO"]),
  /**
   * Days held strictly greater than this = LONG term; at or below = SHORT.
   * Null means this asset type has no short/long distinction at all (e.g.
   * India taxes crypto at one flat rate regardless of holding period) —
   * `flatRatePct` must be set on the rate rule when this is null.
   */
  longTermThresholdDays: z.number().int().positive().nullable(),
  /** Human-readable description of the threshold, e.g. "> 12 months" — shown in the UI so the number isn't unexplained. */
  thresholdLabel: z.string(),
});

export const CapitalGainsRateRuleSchema = z.object({
  holdingType: z.enum(["STOCK", "MUTUAL_FUND", "CRYPTO"]),
  /** Flat rate applied regardless of term (overrides shortTermRatePct/longTermRatePct when set) — e.g. India crypto's flat 30%. */
  flatRatePct: z.number().min(0).max(100).nullable(),
  /** Applied to short-term gains when flatRatePct is null. `null` here means "taxed as ordinary income at the filer's slab rate", not 0%. */
  shortTermRatePct: z.number().min(0).max(100).nullable(),
  /** Applied to long-term gains when flatRatePct is null. */
  longTermRatePct: z.number().min(0).max(100).nullable(),
  /** Per-financial-year exemption subtracted from total long-term gains before tax (0 if none), e.g. India's ₹1,25,000 LTCG exemption. */
  longTermExemptionAmount: z.number().min(0),
  /** False for India crypto (Section 115BBH: crypto losses cannot offset gains from crypto or any other asset) — the harvesting scan and gains aggregator must respect this. */
  lossOffsetAllowed: z.boolean(),
});

export const TaxConfigSchema = z.object({
  countryCode: z.string().length(2),
  countryName: z.string(),
  currencyCode: z.string().length(3),
  /** ISO date this config's rates were last verified accurate. */
  asOf: z.string(),
  /** Where the rates came from, for anyone auditing this later. */
  source: z.string(),
  /** Financial-year boundary — e.g. US: month 1 day 1 (calendar year); India: month 4 day 1 (Apr–Mar). */
  financialYearStartMonth: z.number().int().min(1).max(12),
  financialYearStartDay: z.number().int().min(1).max(31),
  holdingPeriodRules: z.array(HoldingPeriodRuleSchema).min(1),
  capitalGainsRates: z.array(CapitalGainsRateRuleSchema).min(1),
  /** Whether dividend income is taxed at the same rate as long-term capital gains ("qualified"-style) or at ordinary/slab rates. */
  dividendTreatment: z.enum(["SAME_AS_LONG_TERM_GAINS", "ORDINARY_INCOME_SLAB"]),
  notes: z.array(z.string()),
});

export type HoldingPeriodRule = z.infer<typeof HoldingPeriodRuleSchema>;
export type CapitalGainsRateRule = z.infer<typeof CapitalGainsRateRuleSchema>;
export type TaxConfig = z.infer<typeof TaxConfigSchema>;
