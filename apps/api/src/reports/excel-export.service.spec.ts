import ExcelJS from "exceljs";
import { ExcelExportService, type ExportColumn } from "./excel-export.service";

/**
 * Acceptance criterion: "CSV/Excel export round-trips correctly into a
 * spreadsheet tool with correct column types (numbers as numbers, not
 * strings)." Proven by generating a real .xlsx buffer, reading it BACK
 * with ExcelJS itself, and asserting the actual JS type of each cell's
 * value — not just that generation didn't throw.
 */
describe("ExcelExportService", () => {
  const service = new ExcelExportService();
  const columns: ExportColumn[] = [
    { key: "ticker", header: "Ticker", type: "string" },
    { key: "quantity", header: "Quantity", type: "number" },
    { key: "value", header: "Value", type: "currency" },
    { key: "gainPct", header: "Gain %", type: "percent" },
    { key: "purchasedAt", header: "Purchased", type: "date" },
  ];
  const rows = [
    { ticker: "AAPL", quantity: 12, value: 2450.75, gainPct: 8.5, purchasedAt: new Date("2025-01-15") },
    { ticker: "MSFT", quantity: "7", value: "980.10", gainPct: -3.2, purchasedAt: new Date("2025-06-01") }, // deliberately stringy source values
  ];

  it("writes number/currency columns as real numeric Excel cells, not stringified numbers", async () => {
    const buffer = await service.buildWorkbook(columns, rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0]!;

    const row1 = sheet.getRow(2); // row 1 is the header
    expect(typeof row1.getCell(1).value).toBe("string"); // ticker
    expect(typeof row1.getCell(2).value).toBe("number"); // quantity
    expect(row1.getCell(2).value).toBe(12);
    expect(typeof row1.getCell(3).value).toBe("number"); // value (currency)
    expect(row1.getCell(3).value).toBe(2450.75);

    const row2 = sheet.getRow(3);
    // Coercion: a stringy "7"/"980.10" source value must still land as a real number cell.
    expect(typeof row2.getCell(2).value).toBe("number");
    expect(row2.getCell(2).value).toBe(7);
    expect(typeof row2.getCell(3).value).toBe("number");
    expect(row2.getCell(3).value).toBe(980.1);
  });

  it("stores percent columns as a 0-1 fraction with a percent number format (Excel convention)", async () => {
    const buffer = await service.buildWorkbook(columns, rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0]!;
    const cell = sheet.getRow(2).getCell(4);
    expect(typeof cell.value).toBe("number");
    expect(cell.value).toBeCloseTo(0.085);
    expect(sheet.getColumn(4).numFmt).toBe("0.00%");
  });

  it("date columns round-trip as real Date objects", async () => {
    const buffer = await service.buildWorkbook(columns, rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0]!;
    const cell = sheet.getRow(2).getCell(5).value;
    expect(cell instanceof Date).toBe(true);
  });

  it("CSV export leaves numeric-looking values unquoted (matching Phase 15's csv-stringify convention)", () => {
    const csv = service.buildCsv(columns, rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Ticker,Quantity,Value,Gain %,Purchased");
    expect(lines[1]).toContain("AAPL,12,2450.75");
  });
});
