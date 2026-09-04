export interface CalculatorFieldConfig {
  key: string;
  label: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  /** Rendered as a suffix in the input, e.g. "%", "years", "months". Purely cosmetic. */
  suffix?: string;
}

export type ResultFormat = "currency" | "percent" | "number" | "years" | "months";

export interface CalculatorResultField {
  label: string;
  value: number;
  format: ResultFormat;
  /** Headline results render larger/bolder. */
  highlight?: boolean;
}

export interface CalculatorChartPoint {
  x: number;
  /** One or more named series values at this x — e.g. { invested, value } for a SIP growth curve. */
  [seriesKey: string]: number;
}

export interface CalculatorChartConfig {
  data: CalculatorChartPoint[];
  series: Array<{ key: string; label: string; color: string }>;
  xLabel: string;
}

/** What "Save as Goal" should pre-fill, when this calculator's result maps to a savings target. Null if it doesn't apply (see registry.ts for which calculators omit it, and why). */
export interface GoalMapping {
  targetAmount: number;
  suggestedName: string;
  /** Years from today. */
  yearsFromNow: number;
}

export interface CalculatorResult {
  fields: CalculatorResultField[];
  chart: CalculatorChartConfig | null;
  goalMapping: GoalMapping | null;
  /** Surfaced as a warning banner instead of results — e.g. "extra payment exceeds balance" edge cases. */
  error?: string;
}

export interface CalculatorConfig {
  slug: string;
  title: string;
  description: string;
  icon: string;
  fields: CalculatorFieldConfig[];
  compute: (values: Record<string, number>) => CalculatorResult;
}
