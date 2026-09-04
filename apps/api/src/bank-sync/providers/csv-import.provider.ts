import { Injectable, BadRequestException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import type { StatementImportProvider } from "./statement-import-provider.interface";
import type { NormalizedBankTransaction } from "./normalized-transaction";

// Real bank exports vary in header naming — accept the common aliases
// rather than forcing one exact schema.
const DATE_HEADERS = ["date", "transaction date", "posted date", "txn date"];
const DESCRIPTION_HEADERS = ["description", "merchant", "payee", "narration", "details"];
const AMOUNT_HEADERS = ["amount", "transaction amount"];
const DEBIT_HEADERS = ["debit", "withdrawal", "withdrawal amt"];
const CREDIT_HEADERS = ["credit", "deposit", "deposit amt"];
const CURRENCY_HEADERS = ["currency", "currency code"];

function findHeader(headers: string[], candidates: string[]): string | undefined {
  return headers.find((h) => candidates.includes(h.toLowerCase().trim()));
}

function parseAmount(raw: string): number {
  // Strip currency symbols/commas/whitespace; keep sign and decimal point.
  // Bank exports sometimes wrap negatives in parens, e.g. "(42.10)".
  const trimmed = raw.trim();
  const isParenNegative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()]/g, "").replace(/[^0-9.\-]/g, "");
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value)) throw new BadRequestException(`Could not parse amount: "${raw}"`);
  return isParenNegative ? -Math.abs(value) : value;
}

/**
 * Free-tier CSV bank-statement import — no paid API required. Implements
 * `StatementImportProvider` so a future paid India Account Aggregator
 * integration is a drop-in alongside/replacement for this, per PROJECT_CONTEXT.
 */
@Injectable()
export class CsvImportProvider implements StatementImportProvider {
  readonly name = "csv";
  readonly supportedExtensions = [".csv"];

  async parse(fileBuffer: Buffer, fileName: string, defaultCurrency = "USD"): Promise<NormalizedBankTransaction[]> {
    let rows: Record<string, string>[];
    try {
      rows = parse(fileBuffer, { columns: true, trim: true, skip_empty_lines: true, bom: true }) as Record<
        string,
        string
      >[];
    } catch (err) {
      throw new BadRequestException(`Could not parse "${fileName}" as CSV: ${(err as Error).message}`);
    }
    if (rows.length === 0) throw new BadRequestException(`"${fileName}" has no data rows`);

    const headers = Object.keys(rows[0] ?? {});
    const dateHeader = findHeader(headers, DATE_HEADERS);
    const descriptionHeader = findHeader(headers, DESCRIPTION_HEADERS);
    const amountHeader = findHeader(headers, AMOUNT_HEADERS);
    const debitHeader = findHeader(headers, DEBIT_HEADERS);
    const creditHeader = findHeader(headers, CREDIT_HEADERS);
    const currencyHeader = findHeader(headers, CURRENCY_HEADERS);

    if (!dateHeader || !descriptionHeader) {
      throw new BadRequestException(
        `"${fileName}" is missing a recognizable date/description column. Expected one of: ${DATE_HEADERS.join(", ")} / ${DESCRIPTION_HEADERS.join(", ")}`,
      );
    }
    if (!amountHeader && !(debitHeader || creditHeader)) {
      throw new BadRequestException(
        `"${fileName}" is missing a recognizable amount column (a single signed "Amount" column, or separate "Debit"/"Credit" columns).`,
      );
    }

    const results: NormalizedBankTransaction[] = [];
    for (const row of rows) {
      const dateRaw = row[dateHeader];
      const merchant = row[descriptionHeader]?.trim();
      if (!dateRaw || !merchant) continue; // skip blank/summary rows

      const date = new Date(dateRaw);
      if (Number.isNaN(date.getTime())) continue; // skip footer/total rows with non-date "dates"

      let amount: number;
      if (amountHeader && row[amountHeader]) {
        amount = parseAmount(row[amountHeader]);
      } else {
        const debit = debitHeader && row[debitHeader] ? parseAmount(row[debitHeader]) : 0;
        const credit = creditHeader && row[creditHeader] ? parseAmount(row[creditHeader]) : 0;
        amount = credit - Math.abs(debit);
      }

      results.push({
        date,
        amount,
        merchant,
        currencyCode: (currencyHeader && row[currencyHeader]?.trim()) || defaultCurrency,
      });
    }

    return results;
  }
}
