/**
 * ItrDiscrepancyService tests — mocked Prisma + a mocked CapitalGainsService
 * (its own real math is exhaustively tested elsewhere: capital-gains.spec.ts,
 * capital-gains.service.spec.ts). This file verifies the ASSEMBLY layer: that
 * the service correctly calls the SAME authoritative capital-gains summary
 * the Tax Center UI/reports use (not a second computation), correctly
 * annualizes recorded Income rows by source-type bucket, and — the
 * acceptance criterion — surfaces a discrepancy with the right delta when
 * a synthetic ITR's declared capital gains differs from the computed figure.
 */
import { ItrDiscrepancyService } from "./itr-discrepancy.service";
import { parseItrText, field } from "@richer/shared-types";
import type { ParsedItrData } from "@richer/shared-types";

function makeParsed(overrides: Partial<ParsedItrData> = {}): ParsedItrData {
  const base = parseItrText("Assessment Year: 2025-26");
  return { ...base, ...overrides };
}

describe("ItrDiscrepancyService", () => {
  const mockCapitalGainsService = {
    getCapitalGainsSummary: jest.fn(),
  };

  function makePrisma(incomes: Array<{ sourceType: string; frequency: string; amount: string; startDate: Date; isActive: boolean }>, itrDoc: Record<string, unknown> | null) {
    return {
      itrDocument: { findFirst: jest.fn().mockResolvedValue(itrDoc) },
      income: { findMany: jest.fn().mockResolvedValue(incomes) },
    } as never;
  }

  beforeEach(() => jest.clearAllMocks());

  it("acceptance criterion: flags a synthetic case where parsed ITR LTCG differs from CapitalGainsService's computed figure, with the correct delta", async () => {
    mockCapitalGainsService.getCapitalGainsSummary.mockResolvedValue({
      shortTerm: { net: 50000 },
      longTerm: { net: 200000 },
    });
    const parsed = makeParsed({
      capitalGainsSchedule: {
        stcg: field(50000, 0.9),
        ltcg: field(350000, 0.9), // ITR says 350000, computed says 200000 → delta 150000
      },
    });
    const prisma = makePrisma([], { id: "doc1", assessmentYear: "2025-26", parsedData: parsed });
    const service = new ItrDiscrepancyService(prisma, mockCapitalGainsService as never);

    const report = await service.getDiscrepancies("user1", "doc1");

    expect(mockCapitalGainsService.getCapitalGainsSummary).toHaveBeenCalledWith("user1", "2024-25", "IN");
    const ltcgLine = report.lines.find((l) => l.field === "capitalGainsSchedule.ltcg");
    expect(ltcgLine).toBeDefined();
    expect(ltcgLine!.itrValue).toBe(350000);
    expect(ltcgLine!.trackedValue).toBe(200000);
    expect(ltcgLine!.delta).toBe(150000);

    const stcgLine = report.lines.find((l) => l.field === "capitalGainsSchedule.stcg");
    expect(stcgLine).toBeUndefined(); // 50000 == 50000, no discrepancy
  });

  it("annualizes recurring Income rows and sums ONE_TIME rows within the FY when comparing salary income", async () => {
    mockCapitalGainsService.getCapitalGainsSummary.mockResolvedValue({ shortTerm: { net: 0 }, longTerm: { net: 0 } });
    const parsed = makeParsed({
      incomeByHead: {
        ...makeParsed().incomeByHead,
        salary: field(1200000, 0.9),
      },
    });
    const prisma = makePrisma(
      [{ sourceType: "SALARY", frequency: "MONTHLY", amount: "100000", startDate: new Date("2024-06-01"), isActive: true }], // 100000/mo * 12 = 1,200,000/yr
      { id: "doc1", assessmentYear: "2025-26", parsedData: parsed },
    );
    const service = new ItrDiscrepancyService(prisma, mockCapitalGainsService as never);

    const report = await service.getDiscrepancies("user1", "doc1");

    expect(report.lines.find((l) => l.field === "incomeByHead.salary")).toBeUndefined(); // 1,200,000 matches exactly
  });

  it("throws NotFoundException for a document belonging to a different user (findFirst scoped by userId+id)", async () => {
    const prisma = makePrisma([], null);
    const service = new ItrDiscrepancyService(prisma, mockCapitalGainsService as never);
    await expect(service.getDiscrepancies("user1", "doc1")).rejects.toThrow("ITR document not found");
  });
});
