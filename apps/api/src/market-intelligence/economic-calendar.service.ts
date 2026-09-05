import { Injectable } from "@nestjs/common";
import { MacroDataService } from "../risk/macro-data.service";
import { RbiRateService } from "./rbi-rate.service";
import { IpoListingService } from "./ipo-listing.service";
import type { EconomicIndicator, IpoListingDto } from "@richer/shared-types";

export interface EconomicCalendarResponse {
  indicators: EconomicIndicator[];
  ipoListings: IpoListingDto[];
  /** True if every "live" indicator is actually isLive — surfaced so the
   * frontend can show a single honest banner instead of per-widget guessing. */
  allLive: boolean;
}

/**
 * Aggregates Phase 12's FRED-backed macro data (extended in this phase with
 * Fed funds rate + GDP growth), the RBI repo rate (static, honestly
 * labeled), and the manual IPO calendar into one response for the Markets
 * page's economic-calendar widget. No new external calls of its own —
 * every figure here is produced by a service that already owns its own
 * fetch/cache.
 */
@Injectable()
export class EconomicCalendarService {
  constructor(
    private readonly macroData: MacroDataService,
    private readonly rbiRate: RbiRateService,
    private readonly ipoListings: IpoListingService,
  ) {}

  async getCalendar(): Promise<EconomicCalendarResponse> {
    const [fedFunds, inflation, gdp, ipos] = await Promise.all([
      this.macroData.getFedFundsRate(),
      this.macroData.getInflationRate(),
      this.macroData.getGdpGrowthRate(),
      this.ipoListings.list(),
    ]);
    const rbi = this.rbiRate.getRbiRepoRate();

    const indicators: EconomicIndicator[] = [
      { key: "FED_FUNDS_RATE", label: "Fed Funds Rate", valuePct: fedFunds.ratePct, isLive: fedFunds.isLive, fetchedAt: fedFunds.fetchedAt },
      rbi,
      { key: "US_INFLATION_CPI", label: "US Inflation (CPI, YoY)", valuePct: inflation.yoyPct, isLive: inflation.isLive, fetchedAt: inflation.fetchedAt },
      { key: "US_GDP_GROWTH", label: "US GDP Growth", valuePct: gdp.growthPct, isLive: gdp.isLive, fetchedAt: gdp.fetchedAt },
    ];

    return {
      indicators,
      ipoListings: ipos,
      allLive: indicators.every((i) => i.isLive),
    };
  }
}
