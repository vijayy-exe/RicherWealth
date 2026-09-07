import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";

export type ExportColumnType = "string" | "number" | "date" | "currency" | "percent";

export interface ExportColumn {
  key: string;
  header: string;
  type: ExportColumnType;
}

/**
 * The one export path every AG Grid page's "Export" button and every
 * report's tabular section goes through — a number column becomes a real
 * numeric Excel cell (not a stringified number), which is the whole point:
 * a spreadsheet user should be able to sum/sort/chart the column
 * immediately, not have to reparse text first. CSV output uses the same
 * `csv-stringify` library Phase 15's tax CSV already uses, for consistency.
 */
@Injectable()
export class ExcelExportService {
  async buildWorkbook(columns: ExportColumn[], rows: Array<Record<string, unknown>>, sheetName = "Export"): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RicherWealth";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.max(c.header.length + 4, 14),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F5F9" } };

    for (const row of rows) {
      const excelRow: Record<string, unknown> = {};
      for (const col of columns) {
        excelRow[col.key] = this.coerceCellValue(row[col.key], col.type);
      }
      sheet.addRow(excelRow);
    }

    for (const col of columns) {
      if (col.type === "currency") {
        sheet.getColumn(col.key).numFmt = "#,##0.00";
      } else if (col.type === "percent") {
        sheet.getColumn(col.key).numFmt = "0.00%";
      } else if (col.type === "date") {
        sheet.getColumn(col.key).numFmt = "yyyy-mm-dd";
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  buildCsv(columns: ExportColumn[], rows: Array<Record<string, unknown>>): string {
    const header = columns.map((c) => c.header);
    const body = rows.map((row) => columns.map((c) => this.coerceCellValue(row[c.key], c.type)));
    return stringify([header, ...body]);
  }

  private coerceCellValue(value: unknown, type: ExportColumnType): unknown {
    if (value === null || value === undefined) return "";
    if (type === "number" || type === "currency") {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : "";
    }
    if (type === "percent") {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n / 100 : ""; // Excel percent format expects a 0-1 fraction
    }
    if (type === "date") {
      return value instanceof Date ? value : new Date(String(value));
    }
    return String(value);
  }
}
