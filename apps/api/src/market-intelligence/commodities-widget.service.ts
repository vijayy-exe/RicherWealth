import { Injectable } from "@nestjs/common";
import { CommodityPriceSyncService, type CommodityCode } from "../commodities/commodity-price-sync.service";
import { PreciousMetalPriceSyncService } from "../precious-metals/precious-metal-price-sync.service";
import type { MarketQuote } from "@richer/shared-types";

const COMMODITY_LABELS: Record<CommodityCode, string> = {
  OIL: "Crude Oil (WTI)",
  NATURAL_GAS: "Natural Gas",
  WHEAT: "Wheat",
  COFFEE: "Coffee",
  CORN: "Corn",
  COPPER: "Copper",
};

/**
 * Commodities widget for Phase 14's Markets page. Reads through
 * Phase 7's CommodityPriceSyncService/PreciousMetalPriceSyncService
 * `getPrice()` (cache-first, only refetches on an actual cache miss) —
 * no parallel provider integration, per the phase's reuse requirement.
 */
@Injectable()
export class CommoditiesWidgetService {
  constructor(
    private readonly commodities: CommodityPriceSyncService,
    private readonly preciousMetals: PreciousMetalPriceSyncService,
  ) {}

  async getQuotes(): Promise<MarketQuote[]> {
    const commodityCodes: CommodityCode[] = ["OIL", "COPPER", "NATURAL_GAS"];
    const metals: Array<"GOLD" | "SILVER"> = ["GOLD", "SILVER"];

    const [commodityResults, metalResults] = await Promise.all([
      Promise.all(commodityCodes.map((c) => this.commodities.getPrice(c))),
      Promise.all(metals.map((m) => this.preciousMetals.getPrice(m))),
    ]);

    const quotes: MarketQuote[] = [];

    commodityResults.forEach((price, i) => {
      if (!price) return;
      const code = commodityCodes[i]!;
      quotes.push({
        symbol: code,
        label: COMMODITY_LABELS[code],
        price: price.price,
        previousClose: null,
        changePct: null,
        currency: price.currency,
        provider: price.provider,
        fetchedAt: price.fetchedAt,
        isStale: price.isStale,
      });
    });

    metalResults.forEach((price, i) => {
      if (!price) return;
      const metal = metals[i]!;
      quotes.push({
        symbol: metal,
        label: metal === "GOLD" ? "Gold (per oz)" : "Silver (per oz)",
        price: price.pricePerOzUsd,
        previousClose: null,
        changePct: null,
        currency: "USD",
        provider: price.provider,
        fetchedAt: price.fetchedAt,
        isStale: price.isStale,
      });
    });

    return quotes;
  }
}
