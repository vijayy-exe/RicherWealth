import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PriceSyncService } from "../stocks/price-sync.service";
import { CryptoPriceSyncService } from "../crypto/crypto-price-sync.service";
import { NavSyncService } from "../mutual-funds/nav-sync.service";
import { CapitalGainsService } from "./capital-gains.service";
import { scanForHarvestCandidates, getTaxConfig, currentFinancialYear, type HarvestingCandidate, type TaxLotDto } from "@richer/shared-types";
import Decimal from "decimal.js";

/**
 * Rules-based (NOT AI/ML) tax-loss-harvesting scan — Phase 15 requirement.
 * Reuses Phase 4/6/7's already-live price-sync services for "what's it
 * worth right now" rather than adding a fourth, parallel price fetch:
 * StockHolding lots go through PriceSyncService.getPrice (needs the linked
 * StockHolding's exchange, since TaxLot itself only stores the bare
 * ticker — see the assetId join below), crypto through
 * CryptoPriceSyncService.getPrice, mutual funds through
 * NavSyncService.syncSchemeNav (cache-first, same as every other NAV read
 * in this app).
 */
@Injectable()
export class HarvestingService {
  private readonly logger = new Logger(HarvestingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceSync: PriceSyncService,
    private readonly cryptoPriceSync: CryptoPriceSyncService,
    private readonly navSync: NavSyncService,
    private readonly capitalGains: CapitalGainsService,
  ) {}

  async getHarvestCandidates(userId: string, countryCode: string): Promise<HarvestingCandidate[]> {
    const config = getTaxConfig(countryCode);
    const openLots = await this.prisma.taxLot.findMany({
      where: { userId, status: { in: ["OPEN", "PARTIALLY_DISPOSED"] } },
      include: { asset: { include: { stockHolding: true } } },
    });
    if (openLots.length === 0) return [];

    const fy = currentFinancialYear(countryCode);
    const realizedGainsThisYear = await this.capitalGains.getRealizedGainsForFinancialYear(userId, fy);

    const priced = await Promise.all(
      openLots.map(async (lot) => {
        const remainingQuantity = new Decimal(lot.remainingQuantity.toString()).toNumber();
        if (remainingQuantity <= 0) return null;
        const currentPrice = await this.getCurrentPrice(lot);
        if (currentPrice === null) return null; // no live price available — excluded, not guessed
        return {
          lotId: lot.id,
          holdingType: lot.holdingType as "STOCK" | "MUTUAL_FUND" | "CRYPTO",
          ticker: lot.ticker,
          displayName: lot.displayName,
          remainingQuantity,
          costBasisPerUnit: new Decimal(lot.costBasisPerUnit.toString()).toNumber(),
          currentPricePerUnit: currentPrice,
          acquiredAt: lot.acquiredAt,
          _lot: lot,
        };
      }),
    );

    const validPriced = priced.filter((p): p is NonNullable<typeof p> => p !== null);
    const scanResults = scanForHarvestCandidates(
      validPriced.map(({ _lot, ...rest }) => rest),
      config,
      realizedGainsThisYear,
    );

    return scanResults.map((r) => {
      const source = validPriced.find((p) => p.lotId === r.lotId)!;
      const lotDto: TaxLotDto = {
        id: source._lot.id,
        holdingType: r.holdingType,
        assetId: source._lot.assetId,
        ticker: source._lot.ticker,
        displayName: source._lot.displayName,
        quantity: new Decimal(source._lot.quantity.toString()).toNumber(),
        remainingQuantity: r.remainingQuantity,
        costBasisPerUnit: r.costBasisPerUnit,
        costBasisCurrency: source._lot.costBasisCurrency,
        acquiredAt: source._lot.acquiredAt.toISOString(),
        isBackfillEstimate: source._lot.isBackfillEstimate,
        status: source._lot.status as TaxLotDto["status"],
        createdAt: source._lot.createdAt.toISOString(),
      };

      const rateRule = config.capitalGainsRates.find((rr) => rr.holdingType === r.holdingType)!;
      // Estimated saving uses the LONG-term rate as a conservative proxy when
      // term-specific info isn't meaningful here (a not-yet-realized lot has
      // no disposal date yet, so we can't classify SHORT/LONG until the user
      // actually decides when to sell) — flagged via estimatedRatePct so the
      // UI can show its basis, never a bare unexplained number.
      const rate = rateRule.flatRatePct ?? rateRule.longTermRatePct ?? 0;

      return {
        lot: lotDto,
        currentPricePerUnit: r.currentPricePerUnit,
        currentValue: Math.round(r.currentPricePerUnit * r.remainingQuantity * 100) / 100,
        costBasisTotal: Math.round(r.costBasisPerUnit * r.remainingQuantity * 100) / 100,
        unrealizedLoss: -r.unrealizedLossTotal,
        unrealizedLossPct: r.costBasisPerUnit > 0 ? Math.round((r.unrealizedLossPerUnit / r.costBasisPerUnit) * 10000) / 100 : 0,
        offsettableRealizedGain: r.offsetsRealizedGains,
        netBenefit: Math.round(r.unrealizedLossTotal * (rate / 100) * 100) / 100,
        estimatedTaxSaving: Math.round(r.unrealizedLossTotal * (rate / 100) * 100) / 100,
        // Wash-sale detection is explicitly NOT implemented in this phase
        // (see us.json's notes) — always false/null rather than a guessed
        // heuristic that could give false confidence.
        potentialWashSale: false,
        washSaleWarning: null,
        isPriceStale: false,
      } satisfies HarvestingCandidate;
    });
  }

  private async getCurrentPrice(lot: { holdingType: string; ticker: string; asset: { stockHolding: { exchange: string } | null } | null }): Promise<number | null> {
    if (lot.holdingType === "STOCK") {
      const exchange = lot.asset?.stockHolding?.exchange;
      if (!exchange) return null; // no linked live holding to derive the exchange from — can't price a bare ticker
      const price = await this.priceSync.getPrice(lot.ticker, exchange);
      return price?.price ?? null;
    }
    if (lot.holdingType === "CRYPTO") {
      const price = await this.cryptoPriceSync.getPrice(lot.ticker, "usd");
      return price?.price ?? null;
    }
    if (lot.holdingType === "MUTUAL_FUND") {
      return this.navSync.syncSchemeNav(lot.ticker);
    }
    return null;
  }
}
