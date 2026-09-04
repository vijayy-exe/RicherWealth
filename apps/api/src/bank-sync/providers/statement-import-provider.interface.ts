import type { NormalizedBankTransaction } from "./normalized-transaction";

/**
 * The free-tier India bank-sync path — a manual statement upload, parsed
 * locally, no paid open-banking API required. `CsvImportProvider` and
 * `PdfImportProvider` both implement this today; a future paid Account
 * Aggregator (AA) integration would implement the same interface (fetching
 * from the AA API instead of parsing an uploaded file) and could be
 * registered as an additional/replacement provider in `bank-sync.module.ts`
 * without any change to `BankSyncService`, the categorizer, or the
 * Transaction-persistence path — they only ever see `NormalizedBankTransaction[]`.
 */
export interface StatementImportProvider {
  readonly name: string;
  /** MIME types / extensions this provider can handle, for the controller's dispatch. */
  readonly supportedExtensions: string[];
  parse(fileBuffer: Buffer, fileName: string): Promise<NormalizedBankTransaction[]>;
}
