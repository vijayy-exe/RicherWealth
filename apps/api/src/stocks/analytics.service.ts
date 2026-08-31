import { Injectable } from "@nestjs/common";
import type { LivePrice } from "./price-sync.service";

export type FairValueFlag = "UNDERVALUED" | "FAIR" | "OVERVALUED" | "NO_DATA";

export interface HoldingAnalytics {
  livePrice: number;
  currency: string;
  dayChangePct: number | null;
  dayChangeAbs: number | null;
  totalGainAbs: number;
  totalGainPct: number;
  cagr: number | null;           // annualised return since purchase
  dividendYield: number | null;  // % per year
  pe: number | null;
  eps: number | null;
  grahamValue: number | null;    // √(22.5 × EPS × BVPS)
  fairValueFlag: FairValueFlag;
  marketValue: number;           // livePrice × quantity
  costBasis: number;             // avgBuyPrice × quantity
  isStale: boolean;
  provider: string;
}

@Injectable()
export class AnalyticsService {
  /**
   * Compute per-holding analytics given a holding and its current live price.
   *
   * @param quantity      Number of shares held
   * @param avgBuyPrice   Average purchase price per share
   * @param purchaseDate  Date of first purchase (for CAGR)
   * @param liveData      Current price + fundamentals from PriceSyncService
   */
  computeHoldingStats(
    quantity: number,
    avgBuyPrice: number,
    purchaseDate: Date | null,
    liveData: LivePrice,
  ): HoldingAnalytics {
    const livePrice = liveData.price;
    const marketValue = livePrice * quantity;
    const costBasis = avgBuyPrice * quantity;

    const totalGainAbs = marketValue - costBasis;
    const totalGainPct = costBasis > 0 ? (totalGainAbs / costBasis) * 100 : 0;

    // Day change
    let dayChangePct: number | null = null;
    let dayChangeAbs: number | null = null;
    if (liveData.previousClose && liveData.previousClose > 0) {
      dayChangeAbs = livePrice - liveData.previousClose;
      dayChangePct = (dayChangeAbs / liveData.previousClose) * 100;
    }

    // CAGR = (marketValue/costBasis)^(1/years) - 1
    let cagr: number | null = null;
    if (purchaseDate && costBasis > 0 && marketValue > 0) {
      const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
      const years = (Date.now() - purchaseDate.getTime()) / msPerYear;
      if (years >= 0.0833) { // at least 1 month
        cagr = (Math.pow(marketValue / costBasis, 1 / years) - 1) * 100;
      }
    }

    // Graham intrinsic value: √(22.5 × EPS × BVPS)
    const grahamValue = computeGrahamValue(liveData.eps, liveData.bvps);
    const fairValueFlag = computeFairValueFlag(livePrice, grahamValue);

    return {
      livePrice,
      currency: liveData.currency,
      dayChangePct,
      dayChangeAbs,
      totalGainAbs,
      totalGainPct,
      cagr,
      dividendYield: liveData.dividendYield,
      pe: liveData.pe,
      eps: liveData.eps,
      grahamValue,
      fairValueFlag,
      marketValue,
      costBasis,
      isStale: liveData.isStale,
      provider: liveData.provider,
    };
  }
}

// ─── Exported pure functions (easier to unit test) ────────────────────────────

/**
 * Graham intrinsic value formula: √(22.5 × EPS × BVPS)
 *
 * Benjamin Graham's formula as popularised in "The Intelligent Investor."
 * Only meaningful when both EPS and BVPS are positive.
 *
 * @param eps   Earnings per share (trailing twelve months)
 * @param bvps  Book value per share
 * @returns     Intrinsic value in the same currency unit, or null if inputs invalid
 *
 * @example
 * computeGrahamValue(3.0, 20.0) // → √(22.5 × 3.0 × 20.0) = √1350 ≈ 36.74
 */
export function computeGrahamValue(
  eps: number | null | undefined,
  bvps: number | null | undefined,
): number | null {
  if (!eps || !bvps || eps <= 0 || bvps <= 0) return null;
  return Math.sqrt(22.5 * eps * bvps);
}

/**
 * Classify a stock's price vs its Graham intrinsic value.
 *
 * Thresholds (classic value-investing convention):
 *   price < 0.67 × graham  → UNDERVALUED (margin of safety > 33%)
 *   price > 1.50 × graham  → OVERVALUED  (trading at 50%+ premium)
 *   else                    → FAIR
 *
 * @example
 * computeFairValueFlag(25, 36.74)  // UNDERVALUED (25 < 0.67 × 36.74 = 24.6 ... borderline FAIR)
 * computeFairValueFlag(60, 36.74)  // OVERVALUED  (60 > 1.5 × 36.74 = 55.1)
 */
export function computeFairValueFlag(
  price: number,
  grahamValue: number | null,
): FairValueFlag {
  if (!grahamValue) return "NO_DATA";
  const ratio = price / grahamValue;
  if (ratio < 0.67) return "UNDERVALUED";
  if (ratio > 1.5) return "OVERVALUED";
  return "FAIR";
}
