import { Injectable, BadRequestException, Logger } from "@nestjs/common";
// pdf-parse ships no ESM types entry point that plays well with NestJS's
// CommonJS build — require() avoids an interop footgun with its default export.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
import type { StatementImportProvider } from "./statement-import-provider.interface";
import type { NormalizedBankTransaction } from "./normalized-transaction";

// One line per transaction is the common case for a bank-statement PDF's
// text layer: "<date> <description...> <amount>" (optionally with a
// trailing running balance, which we ignore — we only take the first
// amount-looking token after the description). This is a best-effort
// heuristic, not a layout-aware table extractor: unlike CSV import (which
// has a defined, tested accuracy bar), PDF accuracy genuinely varies by
// bank/statement layout, since the text layer's line breaks don't always
// line up with logical rows. Flag this honestly rather than promise a bar
// we can't hold across arbitrary bank PDFs.
const LINE_PATTERN =
  /^\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+([-(]?\$?\d[\d,]*\.\d{2}\)?)\s*(?:\$?[\d,]*\.\d{2})?\s*$/;

function parseDate(raw: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parts = raw.split(/[/-]/).map((p) => parseInt(p, 10));
  if (parts.length !== 3) return null;
  let [a, b, year] = parts;
  if (year === undefined || a === undefined || b === undefined) return null;
  if (year < 100) year += 2000;
  // Ambiguous MM/DD vs DD/MM — assume US MM/DD/YYYY (most common export format), which is the same assumption Plaid/most bank CSV tooling makes by default.
  const month = a;
  const day = b;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAmountToken(raw: string): number {
  const isNegative = raw.startsWith("-") || raw.startsWith("(");
  const cleaned = raw.replace(/[-()$,]/g, "");
  const value = parseFloat(cleaned);
  return isNegative ? -Math.abs(value) : value;
}

@Injectable()
export class PdfImportProvider implements StatementImportProvider {
  private readonly logger = new Logger(PdfImportProvider.name);
  readonly name = "pdf";
  readonly supportedExtensions = [".pdf"];

  async parse(fileBuffer: Buffer, fileName: string, defaultCurrency = "USD"): Promise<NormalizedBankTransaction[]> {
    let text: string;
    try {
      const result = await pdfParse(fileBuffer);
      text = result.text;
    } catch (err) {
      throw new BadRequestException(`Could not read "${fileName}" as PDF: ${(err as Error).message}`);
    }

    const results: NormalizedBankTransaction[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const match = LINE_PATTERN.exec(line);
      if (!match) continue;
      const [, dateRaw, description, amountRaw] = match;
      if (!dateRaw || !description || !amountRaw) continue;
      const date = parseDate(dateRaw);
      if (!date) continue;

      results.push({
        date,
        amount: parseAmountToken(amountRaw),
        merchant: description.trim(),
        currencyCode: defaultCurrency,
      });
    }

    if (results.length === 0) {
      this.logger.warn(`No transaction-shaped lines found in "${fileName}" — this bank's PDF layout may not match the generic heuristic.`);
    }

    return results;
  }
}
