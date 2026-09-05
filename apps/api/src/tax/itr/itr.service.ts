import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { ItrExtractionService } from "./itr-extraction.service";
import type { RequestItrUploadDto, RegisterItrDocumentDto, ConfirmItrDocumentDto } from "../dto/itr.dto";
import type { ItrDocumentDto, ItrYearlyTrendPoint, ParsedItrData } from "@richer/shared-types";
import Decimal from "decimal.js";

/**
 * ITR document CRUD + upload/extraction orchestration. `parsedData` is a
 * STAGING area — grep this file (and the whole apps/api/src/tax/ module):
 * the only table this service ever writes to is `itr_documents`. Nothing
 * here calls TaxLotService/CapitalGainsService/DividendTaxService with
 * write intent, and no other service reads ItrDocument to write elsewhere
 * either — ItrDiscrepancyService (itr-discrepancy.service.ts) only READS
 * both sides for comparison. This is by construction, not by convention:
 * there is no method anywhere that takes ParsedItrData and produces a
 * TaxLot/TaxLotDisposal/Income write.
 */
@Injectable()
export class ItrService {
  private readonly logger = new Logger(ItrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly extraction: ItrExtractionService,
  ) {}

  async requestUploadUrl(userId: string, dto: RequestItrUploadDto): Promise<{ uploadUrl: string; path: string; token: string }> {
    return this.storage.getTaxDocumentUploadUrl(userId, dto.filename, dto.mimeType);
  }

  /** Called after the client finishes the direct-to-storage upload — registers the row and starts extraction. */
  async registerAndProcess(userId: string, dto: RegisterItrDocumentDto): Promise<ItrDocumentDto> {
    const doc = await this.prisma.itrDocument.create({
      data: {
        userId,
        assessmentYear: dto.assessmentYear,
        storagePath: dto.storagePath,
        mimeType: dto.mimeType,
        originalFilename: dto.originalFilename,
        extractionStatus: "PROCESSING",
      },
    });

    this.logger.log(`ITR document ${doc.id} registered for user ${userId} (AY ${dto.assessmentYear}, ${dto.mimeType}) — starting extraction.`);

    try {
      const buffer = await this.storage.downloadTaxDocument(dto.storagePath);
      const result = await this.extraction.extract(buffer, dto.mimeType);

      const updated = await this.prisma.itrDocument.update({
        where: { id: doc.id },
        data: {
          extractionStatus: "EXTRACTED_AWAITING_REVIEW",
          extractionMethod: result.method,
          confidenceScore: result.overallConfidence.toFixed(3),
          parsedData: result.parsed as unknown as object,
        },
      });
      this.logger.log(`ITR document ${doc.id} extracted via ${result.method}, confidence ${result.overallConfidence.toFixed(2)}.`);
      return this.toDto(updated);
    } catch (err) {
      this.logger.error(`ITR extraction failed for document ${doc.id}: ${err instanceof Error ? err.message : String(err)}`);
      const failed = await this.prisma.itrDocument.update({
        where: { id: doc.id },
        data: { extractionStatus: "FAILED", errorMessage: err instanceof Error ? err.message : "Extraction failed" },
      });
      return this.toDto(failed);
    }
  }

  async findOne(userId: string, id: string): Promise<ItrDocumentDto> {
    const doc = await this.prisma.itrDocument.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundException("ITR document not found");
    return this.toDto(doc);
  }

  async findAll(userId: string): Promise<ItrDocumentDto[]> {
    const docs = await this.prisma.itrDocument.findMany({ where: { userId }, orderBy: { assessmentYear: "desc" } });
    return docs.map((d) => this.toDto(d));
  }

  /**
   * The ONLY write this service performs besides extraction — and it only
   * ever touches THIS row. `correctedData` becomes the new parsedData
   * verbatim (the user's corrections from the review screen); status moves
   * to CONFIRMED. No other table is read or written here.
   */
  async confirm(userId: string, id: string, dto: ConfirmItrDocumentDto): Promise<ItrDocumentDto> {
    const doc = await this.prisma.itrDocument.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundException("ITR document not found");
    if (doc.extractionStatus === "PENDING" || doc.extractionStatus === "PROCESSING") {
      throw new BadRequestException("Cannot confirm a document that hasn't finished extraction yet");
    }

    const updated = await this.prisma.itrDocument.update({
      where: { id },
      data: {
        parsedData: dto.correctedData as unknown as object,
        extractionStatus: "CONFIRMED",
        reviewedAt: new Date(),
      },
    });
    this.logger.log(`ITR document ${id} confirmed by user ${userId}.`);
    return this.toDto(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const doc = await this.prisma.itrDocument.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundException("ITR document not found");
    await this.storage.deleteTaxDocument(doc.storagePath);
    await this.prisma.itrDocument.delete({ where: { id } });
  }

  /** Year-over-year income/tax trend across confirmed ITRs — needs 2+ to be meaningful (caller decides display threshold). */
  async getYearlyTrend(userId: string): Promise<ItrYearlyTrendPoint[]> {
    const docs = await this.prisma.itrDocument.findMany({
      where: { userId, extractionStatus: "CONFIRMED" },
      orderBy: { assessmentYear: "asc" },
    });
    return docs.map((d) => {
      const parsed = d.parsedData as unknown as ParsedItrData;
      return {
        assessmentYear: d.assessmentYear,
        grossTotalIncome: parsed?.grossTotalIncome?.value ?? null,
        totalTaxPaid: parsed?.totalTaxPaid?.value ?? null,
      };
    });
  }

  private toDto(doc: {
    id: string; assessmentYear: string; originalFilename: string; mimeType: string;
    extractionStatus: string; extractionMethod: string | null; confidenceScore: Decimal | null;
    parsedData: unknown; errorMessage: string | null; reviewedAt: Date | null; createdAt: Date;
  }): ItrDocumentDto {
    return {
      id: doc.id,
      assessmentYear: doc.assessmentYear,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      extractionStatus: doc.extractionStatus as ItrDocumentDto["extractionStatus"],
      extractionMethod: doc.extractionMethod as ItrDocumentDto["extractionMethod"],
      confidenceScore: doc.confidenceScore ? new Decimal(doc.confidenceScore.toString()).toNumber() : null,
      parsedData: (doc.parsedData ?? null) as ParsedItrData | null,
      errorMessage: doc.errorMessage,
      reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
