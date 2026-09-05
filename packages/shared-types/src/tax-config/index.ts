import usConfigRaw from "./us.json";
import indiaConfigRaw from "./india.json";
import { TaxConfigSchema, type TaxConfig } from "./schema";

export * from "./schema";

/**
 * Every country's config is Zod-validated at import time (module load, not
 * per-request) — a malformed JSON file fails fast at boot with a clear
 * error, rather than surfacing as a confusing NaN deep in a tax report.
 */
function loadConfig(raw: unknown, label: string): TaxConfig {
  const result = TaxConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid tax config "${label}": ${result.error.message}`);
  }
  return result.data;
}

export const US_TAX_CONFIG: TaxConfig = loadConfig(usConfigRaw, "us.json");
export const INDIA_TAX_CONFIG: TaxConfig = loadConfig(indiaConfigRaw, "india.json");

/**
 * Adding a new country = add `<country>.json` + one line here. No
 * calculation code (capital-gains.ts / dividend logic / report generation)
 * ever needs to change.
 */
export const TAX_CONFIGS: Record<string, TaxConfig> = {
  US: US_TAX_CONFIG,
  IN: INDIA_TAX_CONFIG,
};

export function getTaxConfig(countryCode: string): TaxConfig {
  const config = TAX_CONFIGS[countryCode.toUpperCase()];
  if (!config) {
    throw new Error(`No tax config registered for country "${countryCode}". Available: ${Object.keys(TAX_CONFIGS).join(", ")}`);
  }
  return config;
}

export function getHoldingPeriodRule(config: TaxConfig, holdingType: string) {
  const rule = config.holdingPeriodRules.find((r) => r.holdingType === holdingType);
  if (!rule) throw new Error(`No holding-period rule for ${holdingType} in ${config.countryCode} config`);
  return rule;
}

export function getCapitalGainsRateRule(config: TaxConfig, holdingType: string) {
  const rule = config.capitalGainsRates.find((r) => r.holdingType === holdingType);
  if (!rule) throw new Error(`No capital-gains rate rule for ${holdingType} in ${config.countryCode} config`);
  return rule;
}

/**
 * Financial-year window containing `date`, per the country's FY start
 * month/day (US: calendar year; India: Apr–Mar). Returns `[start, end)`
 * half-open — `end` is the instant the NEXT financial year begins.
 */
export function financialYearWindow(config: TaxConfig, date: Date): { start: Date; end: Date; label: string } {
  const { financialYearStartMonth: m, financialYearStartDay: d } = config;
  const year = date.getUTCFullYear();
  const fyStartThisCalendarYear = new Date(Date.UTC(year, m - 1, d));

  const start = date >= fyStartThisCalendarYear ? fyStartThisCalendarYear : new Date(Date.UTC(year - 1, m - 1, d));
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, m - 1, d));

  const label = m === 1 && d === 1
    ? `${start.getUTCFullYear()}`
    : `FY ${start.getUTCFullYear()}-${String(end.getUTCFullYear()).slice(-2)}`;

  return { start, end, label };
}
