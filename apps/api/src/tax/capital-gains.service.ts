import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { DisposeLotDto } from "./dto/tax.dto";
import {
  planFifoConsumption,
  classifyHoldingTerm,
  computeRealizedGainLoss,
  capitalGainsRateForTerm,
  getTaxConfig,
  getHoldingPeriodRule,
  getCapitalGainsRateRule,
  parseFinancialYear,
  type CapitalGainsSummary,
  type GainLossLine,
} from "@richer/shared-types";
import Decimal from "decimal.js";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Authoritative capital-gains calculation — the ONLY place that writes
 * TaxLotDisposal rows. Uses the exact same FIFO/term-classification/
 * gain-computation functions (`@richer/shared-types`'s capital-gains.ts)
 * that packages/shared-types' own test suite hand-verifies, so there is
 * only one implementation of this math, matching this repo's established
 * single-source-of-truth pattern (Phase 9 amortization, Phase 13 calc/).
 */
@Injectable()
export class CapitalGainsService {
  private readonly logger = new Logger(CapitalGainsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sells `dto.quantity` units of `ticker`/`holdingType`, FIFO-consuming
   * across as many open TaxLots as needed, and persists one
   * TaxLotDisposal row per lot consumed. Runs inside a transaction so a
   * partial disposal can never be left half-written.
   */
  async disposeLots(userId: string, holdingType: string, ticker: string, dto: DisposeLotDto, countryCode: string) {
    const disposedAt = new Date(dto.disposedAt);
    if (isNaN(disposedAt.getTime())) throw new BadRequestException("Invalid disposedAt date");

    const openLots = await this.prisma.taxLot.findMany({
      where: { userId, holdingType: holdingType as never, ticker, status: { in: ["OPEN", "PARTIALLY_DISPOSED"] } },
      orderBy: { acquiredAt: "asc" },
    });
    if (openLots.length === 0) throw new NotFoundException(`No open tax lots found for ${ticker}`);

    const firstCurrency = openLots[0]!.costBasisCurrency;
    if (openLots.some((l) => l.costBasisCurrency !== firstCurrency) || dto.proceedsCurrency !== firstCurrency) {
      throw new BadRequestException(
        `Cross-currency disposal not supported in this phase: lots are in ${firstCurrency}, proceeds given in ${dto.proceedsCurrency}. See tax-config notes.`,
      );
    }

    const config = getTaxConfig(countryCode);
    const holdingRule = getHoldingPeriodRule(config, holdingType);

    const consumption = planFifoConsumption(
      openLots.map((l) => ({ id: l.id, remainingQuantity: new Decimal(l.remainingQuantity.toString()).toNumber(), costBasisPerUnit: new Decimal(l.costBasisPerUnit.toString()).toNumber(), acquiredAt: l.acquiredAt })),
      dto.quantity,
    );

    return this.prisma.$transaction(async (tx) => {
      const disposals = [];
      for (const c of consumption) {
        const { term, holdingPeriodDays } = classifyHoldingTerm(c.acquiredAt, disposedAt, holdingRule.longTermThresholdDays);
        const realizedGainLoss = computeRealizedGainLoss(c.quantityConsumed, c.costBasisPerUnit, dto.proceedsPerUnit);

        const disposal = await tx.taxLotDisposal.create({
          data: {
            taxLotId: c.lotId,
            userId,
            quantity: c.quantityConsumed.toFixed(10),
            proceedsPerUnit: dto.proceedsPerUnit.toFixed(6),
            proceedsCurrency: dto.proceedsCurrency,
            disposedAt,
            holdingPeriodDays,
            term,
            realizedGainLoss: realizedGainLoss.toFixed(6),
            notes: dto.notes ?? null,
          },
        });
        disposals.push(disposal);

        const lot = openLots.find((l) => l.id === c.lotId)!;
        const newRemaining = new Decimal(lot.remainingQuantity.toString()).minus(c.quantityConsumed);
        await tx.taxLot.update({
          where: { id: c.lotId },
          data: {
            remainingQuantity: newRemaining.toFixed(10),
            status: newRemaining.lessThanOrEqualTo(0) ? "CLOSED" : "PARTIALLY_DISPOSED",
          },
        });
      }
      this.logger.log(`Disposed ${dto.quantity} of ${ticker} for user ${userId} across ${disposals.length} lot(s)`);
      return disposals;
    });
  }

  /** All-time or per-FY realized net gain (used by the harvesting scan to know how much loss-offsetting headroom exists). */
  async getRealizedGainsForFinancialYear(userId: string, financialYear: string, holdingTypeFilter?: string): Promise<number> {
    const { start, end } = parseFinancialYear(financialYear);
    const disposals = await this.prisma.taxLotDisposal.findMany({
      where: { userId, disposedAt: { gte: start, lte: end }, ...(holdingTypeFilter && { taxLot: { holdingType: holdingTypeFilter as never } }) },
      include: { taxLot: true },
    });
    const net = disposals.reduce((sum, d) => sum + new Decimal(d.realizedGainLoss.toString()).toNumber(), 0);
    return round2(Math.max(0, net)); // only positive net gains create "headroom" to offset
  }

  async getCapitalGainsSummary(userId: string, financialYear: string, countryCode: string): Promise<CapitalGainsSummary> {
    const { start, end } = parseFinancialYear(financialYear);
    const config = getTaxConfig(countryCode);

    const disposals = await this.prisma.taxLotDisposal.findMany({
      where: { userId, disposedAt: { gte: start, lte: end } },
      include: { taxLot: true },
      orderBy: { disposedAt: "asc" },
    });

    const shortLines: GainLossLine[] = [];
    const longLines: GainLossLine[] = [];
    let hasBackfillEstimateData = false;

    for (const d of disposals) {
      const qty = new Decimal(d.quantity.toString()).toNumber();
      const proceedsPerUnit = new Decimal(d.proceedsPerUnit.toString()).toNumber();
      const costBasisPerUnit = new Decimal(d.taxLot.costBasisPerUnit.toString()).toNumber();
      const realized = new Decimal(d.realizedGainLoss.toString()).toNumber();
      if (d.taxLot.isBackfillEstimate) hasBackfillEstimateData = true;

      const line: GainLossLine = {
        taxLotId: d.taxLotId,
        ticker: d.taxLot.ticker,
        displayName: d.taxLot.displayName,
        holdingType: d.taxLot.holdingType as GainLossLine["holdingType"],
        quantity: qty,
        proceedsTotal: round2(proceedsPerUnit * qty),
        costBasisTotal: round2(costBasisPerUnit * qty),
        realizedGainLoss: realized,
        holdingPeriodDays: d.holdingPeriodDays,
        disposedAt: d.disposedAt.toISOString(),
        isBackfillEstimate: d.taxLot.isBackfillEstimate,
      };
      (d.term === "SHORT" ? shortLines : longLines).push(line);
    }

    const sum = (lines: GainLossLine[], predicate: (n: number) => boolean) =>
      round2(lines.filter((l) => predicate(l.realizedGainLoss)).reduce((s, l) => s + l.realizedGainLoss, 0));

    const shortTotalGains = sum(shortLines, (n) => n > 0);
    const shortTotalLosses = sum(shortLines, (n) => n < 0);
    const shortNet = round2(shortTotalGains + shortTotalLosses);

    const longTotalGains = sum(longLines, (n) => n > 0);
    const longTotalLosses = sum(longLines, (n) => n < 0);
    const longNetBeforeExemption = round2(longTotalGains + longTotalLosses);

    const stockRule = getCapitalGainsRateRule(config, "STOCK"); // exemption is a per-FY figure, not per-holding-type, so any rule row carries it
    const exemption = stockRule.longTermExemptionAmount;
    const longTaxableGain = round2(Math.max(0, longNetBeforeExemption - exemption));
    const exemptionApplied = round2(Math.min(exemption, Math.max(0, longNetBeforeExemption)));

    // Estimated tax: computed per-line at its own holding type's rate, then summed — a single summary rate would be wrong when a report mixes e.g. US stock (15% LTCG) and crypto (also 15% here, but a different country might diverge).
    const estimateTaxForLines = (lines: GainLossLine[], term: "SHORT" | "LONG", scaleTaxableRatio: number): number => {
      let total = 0;
      for (const l of lines) {
        if (l.realizedGainLoss <= 0) continue;
        const rule = getCapitalGainsRateRule(config, l.holdingType);
        const rate = capitalGainsRateForTerm(rule, term);
        if (rate === null) continue; // ordinary-income-slab gains: not estimated as a flat number, shown as 0 estimated + a UI note
        total += l.realizedGainLoss * scaleTaxableRatio * (rate / 100);
      }
      return round2(total);
    };

    const longTaxableRatio = longTotalGains + longTotalLosses > 0 ? longTaxableGain / Math.max(longNetBeforeExemption, 0.0001) : 0;

    const shortEstimatedTax = estimateTaxForLines(shortLines, "SHORT", 1);
    const longEstimatedTax = estimateTaxForLines(longLines, "LONG", Math.min(1, longTaxableRatio || 1));

    return {
      financialYear,
      countryCode,
      shortTerm: {
        totalGains: shortTotalGains,
        totalLosses: shortTotalLosses,
        net: shortNet,
        lines: shortLines,
        estimatedTaxAmount: shortEstimatedTax,
        estimatedRatePct: capitalGainsRateForTerm(stockRule, "SHORT") ?? 0,
      },
      longTerm: {
        totalGains: longTotalGains,
        totalLosses: longTotalLosses,
        net: longNetBeforeExemption,
        exemptionApplied,
        taxableGain: longTaxableGain,
        lines: longLines,
        estimatedTaxAmount: longEstimatedTax,
        estimatedRatePct: capitalGainsRateForTerm(stockRule, "LONG") ?? 0,
      },
      totalEstimatedTax: round2(shortEstimatedTax + longEstimatedTax),
      currency: config.currencyCode,
      hasBackfillEstimateData,
    };
  }
}
