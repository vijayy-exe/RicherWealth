import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { TransactionsService } from "../transactions/transactions.service";
import { PlaidService } from "./providers/plaid.service";
import { CsvImportProvider } from "./providers/csv-import.provider";
import { PdfImportProvider } from "./providers/pdf-import.provider";
import { encryptSecret, decryptSecret } from "../auth/crypto.util";
import type { ExchangePublicTokenDto } from "./dto/bank-sync.dto";
import type { PlaidItem } from "@prisma/client";

export interface PlaidItemView {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

export interface SyncSummary {
  created: number;
  skippedDuplicates: number;
  removed: number;
}

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transactions: TransactionsService,
    private readonly plaid: PlaidService,
    private readonly csvImport: CsvImportProvider,
    private readonly pdfImport: PdfImportProvider,
  ) {}

  private getEncryptionKey(): string {
    const key = this.config.get<string>("PLAID_TOKEN_ENCRYPTION_KEY");
    if (!key) throw new Error("PLAID_TOKEN_ENCRYPTION_KEY is not configured");
    return key;
  }

  isPlaidConfigured(): boolean {
    return this.plaid.isConfigured();
  }

  async createPlaidLinkToken(userId: string): Promise<{ linkToken: string }> {
    const linkToken = await this.plaid.createLinkToken(userId);
    return { linkToken };
  }

  async exchangePlaidPublicToken(userId: string, dto: ExchangePublicTokenDto): Promise<PlaidItemView> {
    const { accessToken, itemId } = await this.plaid.exchangePublicToken(dto.publicToken);

    const item = await this.prisma.plaidItem.create({
      data: {
        userId,
        itemId,
        accessTokenEncrypted: encryptSecret(accessToken, this.getEncryptionKey()),
        institutionId: dto.institutionId ?? null,
        institutionName: dto.institutionName ?? null,
      },
    });

    this.logger.log(`Plaid item connected for user ${userId}: ${item.institutionName ?? item.itemId}`);

    // Pull the first batch of Sandbox transactions immediately so the
    // connection feels alive rather than requiring a manual "sync" click.
    await this.syncPlaidItem(userId, item.id).catch((err) =>
      this.logger.warn(`Initial sync after linking item ${item.id} failed (will retry on next manual sync)`, err),
    );

    return this.toView(item);
  }

  async listPlaidItems(userId: string): Promise<PlaidItemView[]> {
    const items = await this.prisma.plaidItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return items.map((i) => this.toView(i));
  }

  async syncPlaidItem(userId: string, itemDbId: string): Promise<SyncSummary> {
    const item = await this.getOwnedItem(userId, itemDbId);
    const accessToken = decryptSecret(item.accessTokenEncrypted, this.getEncryptionKey());

    let cursor = item.cursor;
    let created = 0;
    let skippedDuplicates = 0;
    let removed = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        const page = await this.plaid.syncTransactions(accessToken, cursor);
        const result = await this.transactions.bulkIngest(userId, page.added, "bank_sync");
        created += result.created;
        skippedDuplicates += result.skippedDuplicates;

        if (page.removedExternalIds.length > 0) {
          const { count } = await this.prisma.transaction.deleteMany({
            where: { userId, source: "bank_sync", externalId: { in: page.removedExternalIds } },
          });
          removed += count;
        }

        cursor = page.nextCursor;
        hasMore = page.hasMore;
      }

      await this.prisma.plaidItem.update({
        where: { id: item.id },
        data: { cursor, lastSyncedAt: new Date(), status: "ACTIVE" },
      });
    } catch (err) {
      await this.prisma.plaidItem.update({ where: { id: item.id }, data: { status: "ERROR" } });
      throw err;
    }

    this.logger.log(`Synced Plaid item ${item.id}: ${created} created, ${skippedDuplicates} dupes, ${removed} removed`);
    return { created, skippedDuplicates, removed };
  }

  async disconnectPlaidItem(userId: string, itemDbId: string): Promise<void> {
    const item = await this.getOwnedItem(userId, itemDbId);
    await this.prisma.plaidItem.delete({ where: { id: item.id } });
    this.logger.log(`Plaid item disconnected: ${item.id}`);
  }

  /**
   * The free-tier India path: parse an uploaded CSV/PDF statement locally
   * and ingest it through the exact same TransactionsService.bulkIngest
   * pipeline Plaid uses — categorization and dedup behave identically
   * regardless of source.
   */
  async importStatement(userId: string, file: { buffer: Buffer; originalname: string }, defaultCurrency: string): Promise<SyncSummary> {
    const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));

    let normalized;
    let source: "csv_import" | "pdf_import";
    if (this.csvImport.supportedExtensions.includes(extension)) {
      normalized = await this.csvImport.parse(file.buffer, file.originalname, defaultCurrency);
      source = "csv_import";
    } else if (this.pdfImport.supportedExtensions.includes(extension)) {
      normalized = await this.pdfImport.parse(file.buffer, file.originalname, defaultCurrency);
      source = "pdf_import";
    } else {
      throw new BadRequestException(`Unsupported file type "${extension}" — upload a .csv or .pdf bank statement.`);
    }

    const result = await this.transactions.bulkIngest(userId, normalized, source);
    return { ...result, removed: 0 };
  }

  private async getOwnedItem(userId: string, itemDbId: string): Promise<PlaidItem> {
    const item = await this.prisma.plaidItem.findUnique({ where: { id: itemDbId } });
    if (!item) throw new NotFoundException("Bank connection not found");
    if (item.userId !== userId) throw new ForbiddenException("Access denied");
    return item;
  }

  private toView(item: PlaidItem): PlaidItemView {
    return {
      id: item.id,
      institutionName: item.institutionName,
      status: item.status,
      lastSyncedAt: item.lastSyncedAt,
      createdAt: item.createdAt,
    };
  }
}
