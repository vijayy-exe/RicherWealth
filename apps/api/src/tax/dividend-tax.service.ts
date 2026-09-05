import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { RecordDividendDto } from "./dto/tax.dto";
import { getTaxConfig, parseFinancialYear, type DividendTaxSummary, type DividendRecord } from "@richer/shared-types";
import Decimal from "decimal.js";

interface DividendDetails {
  isDividend: true;
  holdingType: "STOCK" | "MUTUAL_FUND" | "CRYPTO";
  ticker: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Dividend tracking deliberately does NOT get a new table. `Income`
 * already has `sourceType: DIVIDENDS` (defined since Phase 10, never
 * previously used) — a dividend is just a ONE_TIME Income row (excluded
 * from the monthly-passive-income rollup the same way every other
 * ONE_TIME entry already is, per income.service.ts:103) with
 * `details: { isDividend: true, holdingType, ticker }` linking it to the
 * paying security. This is the reuse this repo's data-model principle asks
 * for (PROJECT_CONTEXT.md: "a `type` discriminator... PLUS dedicated
 * tables for high-volume types" — dividends aren't high-volume enough here
 * to earn a dedicated table).
 */
@Injectable()
export class DividendTaxService {
  private readonly logger = new Logger(DividendTaxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordDividend(userId: string, dto: RecordDividendDto) {
    const receivedAt = new Date(dto.receivedAt);
    if (isNaN(receivedAt.getTime())) throw new BadRequestException("Invalid receivedAt date");

    const details: DividendDetails = { isDividend: true, holdingType: dto.holdingType, ticker: dto.ticker };

    const income = await this.prisma.income.create({
      data: {
        userId,
        sourceType: "DIVIDENDS",
        name: `${dto.displayName} dividend`,
        amount: dto.amount.toFixed(6),
        frequency: "ONE_TIME",
        currencyCode: dto.currencyCode,
        startDate: receivedAt,
        isActive: false, // ONE_TIME entries are historical events, not ongoing income streams
        notes: dto.notes ?? null,
        details: details as unknown as object,
      },
    });
    this.logger.log(`Dividend recorded: ${income.id} (${dto.ticker}, ${dto.amount} ${dto.currencyCode}) for user ${userId}`);
    return income;
  }

  async getDividendSummary(userId: string, financialYear: string, countryCode: string): Promise<DividendTaxSummary> {
    const { start, end } = parseFinancialYear(financialYear);
    const config = getTaxConfig(countryCode);

    const incomes = await this.prisma.income.findMany({
      where: { userId, sourceType: "DIVIDENDS", frequency: "ONE_TIME", startDate: { gte: start, lte: end } },
      orderBy: { startDate: "asc" },
    });

    const records: DividendRecord[] = incomes.map((i) => {
      const details = (i.details ?? {}) as Partial<DividendDetails>;
      return {
        id: i.id,
        ticker: details.ticker ?? "UNKNOWN",
        displayName: i.name,
        holdingType: details.holdingType ?? "STOCK",
        amount: new Decimal(i.amount.toString()).toNumber(),
        currencyCode: i.currencyCode,
        receivedAt: (i.startDate ?? i.createdAt).toISOString(),
      };
    });

    const totalDividendIncome = round2(records.reduce((s, r) => s + r.amount, 0));

    // Dividend rate: config.dividendTreatment tells us whether to reuse the
    // long-term-gains rate (US: qualified dividends taxed like LTCG) or flag
    // it as ordinary-income-slab (India: dividends taxed at the recipient's
    // slab rate since the 2020 Budget abolished Dividend Distribution Tax) —
    // either way this is an ESTIMATE, never presented as a filed-return figure.
    const stockRule = config.capitalGainsRates.find((r) => r.holdingType === "STOCK")!;
    const estimatedRatePct = config.dividendTreatment === "SAME_AS_LONG_TERM_GAINS" ? (stockRule.longTermRatePct ?? 0) : 0;
    const estimatedWithholdingTax = config.dividendTreatment === "SAME_AS_LONG_TERM_GAINS" ? round2(totalDividendIncome * (estimatedRatePct / 100)) : 0;

    return {
      financialYear,
      countryCode,
      totalDividendIncome,
      currency: config.currencyCode,
      estimatedWithholdingTax,
      estimatedRatePct,
      records,
    };
  }
}
