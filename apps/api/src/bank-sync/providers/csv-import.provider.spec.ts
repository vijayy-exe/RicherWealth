import { readFileSync } from "fs";
import { join } from "path";
import { CsvImportProvider } from "./csv-import.provider";
import { categorizeMerchant } from "../../transactions/categorization/category-rules";

describe("CsvImportProvider", () => {
  const provider = new CsvImportProvider();

  it("parses a well-formed CSV into normalized transactions", async () => {
    const csv = Buffer.from("Date,Description,Amount\n2026-01-05,STARBUCKS,-5.75\n2026-01-06,PAYROLL,3500.00\n");
    const result = await provider.parse(csv, "test.csv");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ merchant: "STARBUCKS", amount: -5.75, currencyCode: "USD" });
    expect(result[0]?.date.getUTCFullYear()).toBe(2026);
    expect(result[1]).toMatchObject({ merchant: "PAYROLL", amount: 3500 });
  });

  it("supports separate Debit/Credit columns instead of a single signed Amount", async () => {
    const csv = Buffer.from(
      "Transaction Date,Merchant,Debit,Credit\n2026-01-05,UBER TRIP,18.40,\n2026-01-06,DIVIDEND,,240.55\n",
    );
    const result = await provider.parse(csv, "test.csv");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ merchant: "UBER TRIP", amount: -18.4 });
    expect(result[1]).toMatchObject({ merchant: "DIVIDEND", amount: 240.55 });
  });

  it("handles parenthesized negative amounts", async () => {
    const csv = Buffer.from("Date,Description,Amount\n2026-01-05,SOME FEE,(12.50)\n");
    const result = await provider.parse(csv, "test.csv");
    expect(result[0]?.amount).toBe(-12.5);
  });

  it("rejects a CSV with no recognizable date/description columns", async () => {
    const csv = Buffer.from("Foo,Bar\n1,2\n");
    await expect(provider.parse(csv, "bad.csv")).rejects.toThrow(/recognizable date\/description column/);
  });

  it("skips blank/footer rows without a parseable date", async () => {
    const csv = Buffer.from(
      "Date,Description,Amount\n2026-01-05,STARBUCKS,-5.75\nTOTAL,,\"-5.75\"\n",
    );
    const result = await provider.parse(csv, "test.csv");
    expect(result).toHaveLength(1);
  });

  it("correctly parses and auto-categorizes at least 90% of a realistic sample statement out of the box", async () => {
    const fixture = readFileSync(join(__dirname, "fixtures/sample-statement.csv"));
    const normalized = await provider.parse(fixture, "sample-statement.csv");

    // The fixture has 31 rows (2 income deposits, 29 expenses).
    expect(normalized).toHaveLength(31);

    const expenseRows = normalized.filter((t) => t.amount < 0);
    const categorized = expenseRows.map((t) => categorizeMerchant(t.merchant));
    const confidentlyCategorized = categorized.filter((c) => !c.needsReview);

    const accuracy = confidentlyCategorized.length / expenseRows.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });
});
