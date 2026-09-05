/**
 * ItrService tests — mocked Prisma/Storage/Extraction. The most important
 * test here is the acceptance criterion "no parsed field reaches the
 * user's financial record without explicit confirmation": it proves, at
 * runtime (not by code inspection alone), that confirm() — and every other
 * method on this service — never touches taxLot/taxLotDisposal/income.
 * The mock Prisma's methods for those tables throw if called at all, so a
 * future accidental write path would fail this test immediately.
 */
import { ItrService } from "./itr.service";
import { field } from "@richer/shared-types";
import type { ParsedItrData } from "@richer/shared-types";

function throwing(label: string) {
  return jest.fn(() => { throw new Error(`Unexpected write/read to ${label} — ItrService must never touch financial-record tables.`); });
}

function makeParsed(): ParsedItrData {
  return {
    assessmentYear: field("2025-26", 0.9),
    formType: field("ITR-1", 0.9),
    grossTotalIncome: field(1000000, 0.9),
    incomeByHead: {
      salary: field(1000000, 0.9),
      houseProperty: field(0, 0.9),
      capitalGains: field(0, 0.9),
      otherSources: field(0, 0.9),
      business: field(null, 0),
    },
    deductions: {},
    totalTaxPaid: field(100000, 0.9),
    refundOrDemand: field({ type: "NIL", amount: 0 }, 0.9),
    capitalGainsSchedule: { stcg: field(null, 0), ltcg: field(null, 0) },
  };
}

describe("ItrService — no-write-path guarantee (acceptance criterion)", () => {
  function makeService(doc: Record<string, unknown>) {
    const mockPrisma = {
      itrDocument: {
        create: jest.fn().mockResolvedValue(doc),
        findFirst: jest.fn().mockResolvedValue(doc),
        update: jest.fn().mockImplementation((args) => Promise.resolve({ ...doc, ...args.data })),
        findMany: jest.fn().mockResolvedValue([doc]),
        delete: jest.fn().mockResolvedValue(doc),
      },
      // Any attempt to write (or even read) these tables from ItrService is a bug.
      taxLot: { create: throwing("taxLot.create"), update: throwing("taxLot.update"), findMany: throwing("taxLot.findMany") },
      taxLotDisposal: { create: throwing("taxLotDisposal.create"), update: throwing("taxLotDisposal.update") },
      income: { create: throwing("income.create"), update: throwing("income.update") },
    } as never;
    const mockStorage = {
      getTaxDocumentUploadUrl: jest.fn().mockResolvedValue({ uploadUrl: "https://example/signed", path: "u1/itr/f.pdf" }),
      downloadTaxDocument: jest.fn().mockResolvedValue(Buffer.from("fake pdf bytes")),
      deleteTaxDocument: jest.fn().mockResolvedValue(undefined),
    } as never;
    const mockExtraction = {
      extract: jest.fn().mockResolvedValue({ method: "PDF_TEXT", rawText: "irrelevant", parsed: makeParsed(), overallConfidence: 0.9 }),
    } as never;
    return new ItrService(mockPrisma, mockStorage, mockExtraction);
  }

  const baseDoc = {
    id: "doc1", userId: "user1", assessmentYear: "2025-26", storagePath: "u1/itr/f.pdf",
    mimeType: "application/pdf", originalFilename: "itr.pdf", extractionStatus: "EXTRACTED_AWAITING_REVIEW",
    extractionMethod: "PDF_TEXT", confidenceScore: { toString: () => "0.900" }, parsedData: makeParsed(),
    errorMessage: null, reviewedAt: null, createdAt: new Date(),
  };

  it("registerAndProcess only writes to itrDocument (create + update), never TaxLot/TaxLotDisposal/Income", async () => {
    const service = makeService(baseDoc);
    const result = await service.registerAndProcess("user1", {
      assessmentYear: "2025-26", storagePath: "u1/itr/f.pdf", mimeType: "application/pdf", originalFilename: "itr.pdf",
    });
    expect(result.extractionStatus).toBe("EXTRACTED_AWAITING_REVIEW");
  });

  it("confirm() ONLY updates the ItrDocument row (status→CONFIRMED, parsedData→correctedData) — no other table is touched", async () => {
    const service = makeService(baseDoc);
    const correctedData = makeParsed();
    correctedData.grossTotalIncome = field(1050000, 1.0); // simulating a user correction on the review screen

    const result = await service.confirm("user1", "doc1", { correctedData });

    expect(result.extractionStatus).toBe("CONFIRMED");
    expect(result.parsedData!.grossTotalIncome.value).toBe(1050000);
    // If confirm() had touched taxLot/taxLotDisposal/income, the throwing mocks above would have thrown by now.
  });

  it("confirm() refuses to confirm a document still PENDING/PROCESSING (nothing to review yet)", async () => {
    const service = makeService({ ...baseDoc, extractionStatus: "PENDING" });
    await expect(service.confirm("user1", "doc1", { correctedData: makeParsed() })).rejects.toThrow(/hasn't finished extraction/);
  });

  it("delete() removes the storage object and the ItrDocument row — still never touches financial tables", async () => {
    const service = makeService(baseDoc);
    await expect(service.delete("user1", "doc1")).resolves.toBeUndefined();
  });
});
