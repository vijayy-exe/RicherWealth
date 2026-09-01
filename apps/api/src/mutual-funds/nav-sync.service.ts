import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MutualFundsService } from "./mutual-funds.service";
import axios from "axios";

const MFAPI_BASE = "https://api.mfapi.in/mf";

export interface SchemeSearchResult {
  schemeCode: string;
  schemeName: string;
}

export interface MfApiSchemeData {
  meta: {
    scheme_name: string;
    fund_house: string;
    scheme_type: string;
    scheme_category: string;
    scheme_code: number;
  };
  data: Array<{ date: string; nav: string }>;
  status: string;
}

@Injectable()
export class NavSyncService {
  private readonly logger = new Logger(NavSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mfService: MutualFundsService,
  ) {}

  // ─── Scheme Search (MFAPI free, no key needed) ─────────────────────────────

  /**
   * Search mutual fund schemes by name or code via MFAPI.in
   * API: GET https://api.mfapi.in/mf/search?q={query}
   */
  async searchSchemes(query: string): Promise<SchemeSearchResult[]> {
    if (!query || query.trim().length < 2) return [];

    try {
      const url = `${MFAPI_BASE}/search?q=${encodeURIComponent(query.trim())}`;
      const res = await axios.get<SchemeSearchResult[]>(url, {
        timeout: 8000,
        headers: { "Accept": "application/json" },
      });

      // MFAPI returns: [{ schemeCode: 120503, schemeName: "..." }, ...]
      const results = res.data;
      if (!Array.isArray(results)) return [];

      return results.slice(0, 20).map((r) => ({
        schemeCode: String(r.schemeCode),
        schemeName: r.schemeName,
      }));
    } catch (err) {
      this.logger.warn(`MFAPI search failed: ${String(err)}`);
      return [];
    }
  }

  // ─── NAV Fetch for a Single Scheme ─────────────────────────────────────────

  /**
   * Fetch latest NAV + history from MFAPI and upsert into NavHistory.
   * Returns the latest NAV value, or null on failure.
   */
  async syncSchemeNav(schemeCode: string): Promise<number | null> {
    try {
      const url = `${MFAPI_BASE}/${schemeCode}`;
      const res = await axios.get<MfApiSchemeData>(url, {
        timeout: 10000,
        headers: { "Accept": "application/json" },
      });

      const data = res.data;
      if (!data || data.status !== "SUCCESS" || !data.data?.length) {
        this.logger.warn(`MFAPI: no data for scheme ${schemeCode}`);
        return null;
      }

      // MFAPI returns dates as "dd-Mon-yyyy" e.g. "01-Sep-2024"
      // Upsert the last 365 days of NAV history
      const historyToUpsert = data.data.slice(0, 365);

      for (const point of historyToUpsert) {
        const navValue = parseFloat(point.nav);
        if (isNaN(navValue)) continue;

        const parsedDate = parseNavDate(point.date);
        if (!parsedDate) continue;

        await this.prisma.navHistory.upsert({
          where: { schemeCode_date: { schemeCode, date: parsedDate } },
          create: { schemeCode, date: parsedDate, nav: navValue.toString() },
          update: { nav: navValue.toString() },
        });
      }

      // Latest NAV is the first entry (MFAPI returns newest-first)
      const firstEntry = data.data[0];
      if (!firstEntry) {
        this.logger.warn(`MFAPI: empty data array for scheme ${schemeCode}`);
        return null;
      }
      const latestNavValue = parseFloat(firstEntry.nav);
      this.logger.log(`MFAPI ✓ ${schemeCode} (${data.meta.scheme_name}) → NAV ${latestNavValue}`);

      // Sync Asset.currentValue for all holdings of this scheme
      await this.mfService.syncHoldingValues(schemeCode, latestNavValue);

      return latestNavValue;
    } catch (err) {
      this.logger.warn(`MFAPI sync failed for ${schemeCode}: ${String(err)}`);
      return null;
    }
  }

  // ─── Bulk Sync (called by scheduler) ───────────────────────────────────────

  async syncAllActiveSchemes(): Promise<void> {
    const schemes = await this.prisma.mutualFundHolding.findMany({
      where: { asset: { deletedAt: null } },
      distinct: ["schemeCode"],
      select: { schemeCode: true },
    });

    this.logger.log(`NAV sync: ${schemes.length} schemes to update`);

    for (const { schemeCode } of schemes) {
      await this.syncSchemeNav(schemeCode);
      // MFAPI is free and has no official rate limit, but be polite
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parse MFAPI date. Handles both "DD-MM-YYYY" (numeric month — confirmed as
 * the actual live format via a direct API call, e.g. "28-08-2026") and
 * "DD-Mon-YYYY" (text month, e.g. "28-Aug-2026" — kept for resilience in
 * case the API's format varies by endpoint or changes again; the numeric
 * case silently produced zero parsed rows before this fix, since
 * MONTH_MAP["08"] is undefined).
 * Returns a Date object (midnight UTC) or null if unparseable.
 */
function parseNavDate(dateStr: string): Date | null {
  try {
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const dayStr = parts[0];
    const monthStr = parts[1];
    const yearStr = parts[2];
    if (!dayStr || !monthStr || !yearStr) return null;

    const numericMonth = parseInt(monthStr, 10);
    const month = /^\d+$/.test(monthStr) && numericMonth >= 1 && numericMonth <= 12
      ? numericMonth - 1
      : MONTH_MAP[monthStr];
    if (month === undefined) return null;

    const date = new Date(Date.UTC(parseInt(yearStr, 10), month, parseInt(dayStr, 10)));
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}
