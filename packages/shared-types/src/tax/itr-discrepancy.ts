/**
 * Pure comparison of parsed ITR figures against RicherWealth's own computed
 * figures for the same financial year. Read-only/informational by design —
 * this module has no write capability at all (it doesn't import Prisma or
 * take a userId), which is itself the guarantee that ITR data can never
 * overwrite a financial record: the only thing a caller can do with its
 * output is display it.
 */

import type { ParsedItrData, ItrDiscrepancyLine, ItrDiscrepancyReport } from "./itr-types";

/** Absolute-amount threshold below which a difference isn't worth flagging (rounding/estimation noise). */
const MATERIALITY_THRESHOLD = 1;

function line(label: string, fieldPath: string, itr: { value: number | null; needsReview: boolean } | null, tracked: number): ItrDiscrepancyLine | null {
  if (!itr || itr.value === null) return null;
  const delta = round2(itr.value - tracked);
  if (Math.abs(delta) < MATERIALITY_THRESHOLD) return null;
  return { label, field: fieldPath, itrValue: itr.value, trackedValue: tracked, delta, itrFieldNeedsReview: itr.needsReview };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface TrackedFigures {
  /** Computed net short-term capital gains for the FY (CapitalGainsService.getCapitalGainsSummary(...).shortTerm.net). */
  computedStcg: number;
  /** Computed net long-term capital gains for the FY (…longTerm.net — before exemption, to match what an ITR reports pre-exemption). */
  computedLtcg: number;
  /** Sum of recorded Income rows for the FY with sourceType=SALARY (annualized via toAnnualAmount). */
  recordedSalaryIncome: number;
  /** sourceType=RENTAL */
  recordedHousePropertyIncome: number;
  /** sourceType=BUSINESS */
  recordedBusinessIncome: number;
  /** Everything else (DIVIDENDS/ROYALTIES/FREELANCE/INTEREST/AFFILIATE/YOUTUBE/OTHER) */
  recordedOtherSourcesIncome: number;
}

export function computeItrDiscrepancies(
  parsed: ParsedItrData,
  tracked: TrackedFigures,
  assessmentYear: string,
  financialYear: string,
  currency: string,
): ItrDiscrepancyReport {
  const lines: ItrDiscrepancyLine[] = [];

  const stcgLine = line("Short-Term Capital Gains", "capitalGainsSchedule.stcg", parsed.capitalGainsSchedule.stcg, tracked.computedStcg);
  if (stcgLine) lines.push(stcgLine);

  const ltcgLine = line("Long-Term Capital Gains", "capitalGainsSchedule.ltcg", parsed.capitalGainsSchedule.ltcg, tracked.computedLtcg);
  if (ltcgLine) lines.push(ltcgLine);

  const salaryLine = line("Salary Income", "incomeByHead.salary", parsed.incomeByHead.salary, tracked.recordedSalaryIncome);
  if (salaryLine) lines.push(salaryLine);

  const housePropertyLine = line("House Property Income", "incomeByHead.houseProperty", parsed.incomeByHead.houseProperty, tracked.recordedHousePropertyIncome);
  if (housePropertyLine) lines.push(housePropertyLine);

  const businessLine = line("Business Income", "incomeByHead.business", parsed.incomeByHead.business, tracked.recordedBusinessIncome);
  if (businessLine) lines.push(businessLine);

  const otherSourcesLine = line("Other Sources Income", "incomeByHead.otherSources", parsed.incomeByHead.otherSources, tracked.recordedOtherSourcesIncome);
  if (otherSourcesLine) lines.push(otherSourcesLine);

  return { assessmentYear, financialYear, currency, lines };
}
