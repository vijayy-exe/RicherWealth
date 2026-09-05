import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CapitalGainsService } from "../capital-gains.service";
import {
  computeItrDiscrepancies,
  assessmentYearToFinancialYear,
  parseFinancialYear,
  toAnnualAmount,
  getTaxConfig,
  type ItrDiscrepancyReport,
  type ParsedItrData,
  type RecurringFrequency,
} from "@richer/shared-types";
import Decimal from "decimal.js";

/**
 * Read-only comparison of a confirmed/extracted ITR against RicherWealth's
 * own computed figures for the matching financial year. Calls
 * CapitalGainsService.getCapitalGainsSummary — the SAME authoritative
 * capital-gains computation the on-screen Tax Center summary and the PDF/
 * CSV reports use — rather than re-deriving gains from TaxLotDisposal rows
 * a second way. This service has no update/create method at all: it cannot
 * write to TaxLot/TaxLotDisposal/Income even by mistake.
 */
@Injectable()
export class ItrDiscrepancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capitalGains: CapitalGainsService,
  ) {}

  async getDiscrepancies(userId: string, itrDocumentId: string): Promise<ItrDiscrepancyReport> {
    const doc = await this.prisma.itrDocument.findFirst({ where: { id: itrDocumentId, userId } });
    if (!doc) throw new NotFoundException("ITR document not found");

    const parsed = doc.parsedData as unknown as ParsedItrData;
    const financialYear = assessmentYearToFinancialYear(doc.assessmentYear);
    const config = getTaxConfig("IN"); // ITR parsing is India-specific in this phase (ITR-1/2/3/4)
    const currency = config.currencyCode;

    const gains = await this.capitalGains.getCapitalGainsSummary(userId, financialYear, "IN");

    const { start, end } = parseFinancialYear(financialYear);
    const incomes = await this.prisma.income.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { frequency: "ONE_TIME", startDate: { gte: start, lte: end } },
          { frequency: { not: "ONE_TIME" }, isActive: true },
        ],
      },
    });

    const sumBySource = (sourceTypes: string[]): number => {
      const rows = incomes.filter((i) => sourceTypes.includes(i.sourceType));
      const total = rows.reduce((s, i) => s + toAnnualAmount(new Decimal(i.amount.toString()).toNumber(), i.frequency as RecurringFrequency), 0);
      return Math.round((total + Number.EPSILON) * 100) / 100;
    };

    const report = computeItrDiscrepancies(
      parsed,
      {
        computedStcg: gains.shortTerm.net,
        computedLtcg: gains.longTerm.net,
        recordedSalaryIncome: sumBySource(["SALARY"]),
        recordedHousePropertyIncome: sumBySource(["RENTAL"]),
        recordedBusinessIncome: sumBySource(["BUSINESS"]),
        recordedOtherSourcesIncome: sumBySource(["DIVIDENDS", "ROYALTIES", "FREELANCE", "INTEREST", "AFFILIATE", "YOUTUBE", "OTHER"]),
      },
      doc.assessmentYear,
      financialYear,
      currency,
    );
    return report;
  }
}
