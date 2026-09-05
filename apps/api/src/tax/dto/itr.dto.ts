import { z } from "zod";

export const requestItrUploadSchema = z.object({
  assessmentYear: z.string().regex(/^\d{4}-\d{2}$/, 'Use "2025-26" format'),
  filename: z.string().min(1),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
});
export type RequestItrUploadDto = z.infer<typeof requestItrUploadSchema>;

export const registerItrDocumentSchema = z.object({
  assessmentYear: z.string().regex(/^\d{4}-\d{2}$/),
  storagePath: z.string().min(1),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  originalFilename: z.string().min(1),
});
export type RegisterItrDocumentDto = z.infer<typeof registerItrDocumentSchema>;

const fieldSchema = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({ value: inner.nullable(), confidence: z.number(), needsReview: z.boolean() });

const numberFieldSchema = fieldSchema(z.number());

/**
 * The review-screen confirmation payload — a full, possibly-user-corrected
 * ParsedItrData. Confirming ONLY updates ItrDocument.parsedData/status; see
 * ItrService.confirm — there is deliberately no code path from here into
 * TaxLot/TaxLotDisposal/Income.
 */
export const confirmItrDocumentSchema = z.object({
  correctedData: z.object({
    assessmentYear: fieldSchema(z.string()),
    formType: fieldSchema(z.enum(["ITR-1", "ITR-2", "ITR-3", "ITR-4"])),
    grossTotalIncome: numberFieldSchema,
    incomeByHead: z.object({
      salary: numberFieldSchema,
      houseProperty: numberFieldSchema,
      capitalGains: numberFieldSchema,
      otherSources: numberFieldSchema,
      business: numberFieldSchema,
    }),
    deductions: z.record(z.string(), numberFieldSchema),
    totalTaxPaid: numberFieldSchema,
    refundOrDemand: fieldSchema(z.object({ type: z.enum(["REFUND", "DEMAND", "NIL"]), amount: z.number() })),
    capitalGainsSchedule: z.object({
      stcg: numberFieldSchema,
      ltcg: numberFieldSchema,
    }),
  }),
});
export type ConfirmItrDocumentDto = z.infer<typeof confirmItrDocumentSchema>;
