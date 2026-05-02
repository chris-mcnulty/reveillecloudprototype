import type { Response } from "express";
import ExcelJS from "exceljs";

export type ExportColumn<T> = {
  key: string;
  header: string;
  width?: number;
  accessor: (row: T) => string | number | boolean | Date | null | undefined;
};

// Characters that, when at the start of a spreadsheet cell, can be
// interpreted by Excel/Sheets/LibreOffice as a formula. Defang by
// prefixing a leading apostrophe so the cell is treated as text.
// Covers '=', '+', '-', '@', plus tab (\t) and CR (\r) which OWASP also flags.
const SPREADSHEET_INJECTION_RE = /^[=+\-@\t\r]/;

export function defangSpreadsheetCell(str: string): string {
  return SPREADSHEET_INJECTION_RE.test(str) ? `'${str}` : str;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === "object") {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  str = defangSpreadsheetCell(str);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "export";
}

export function buildExportFilename(base: string, format: "csv" | "xlsx"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${sanitizeFilename(base)}_${stamp}.${format}`;
}

/**
 * Drive a row source to completion. Accepts:
 *  - AsyncIterable<T> (preferred, true streaming)
 *  - Iterable<T> (in-memory)
 */
async function* iterate<T>(source: AsyncIterable<T> | Iterable<T>): AsyncGenerator<T> {
  const asyncIterator = (source as AsyncIterable<T>)[Symbol.asyncIterator];
  if (typeof asyncIterator === "function") {
    for await (const row of source as AsyncIterable<T>) yield row;
    return;
  }
  const iter = (source as Iterable<T>)[Symbol.iterator]();
  while (true) {
    const next = iter.next();
    if (next.done) break;
    yield next.value;
  }
}

export async function streamCsv<T>(
  res: Response,
  filename: string,
  columns: ExportColumn<T>[],
  source: AsyncIterable<T> | Iterable<T>,
): Promise<void> {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  res.write(columns.map(c => csvEscape(c.header)).join(",") + "\n");

  for await (const row of iterate(source)) {
    const cells = columns.map(c => csvEscape(c.accessor(row)));
    res.write(cells.join(",") + "\n");
  }
  res.end();
}

type XlsxCell = string | number | boolean | Date | null;

export async function streamXlsx<T>(
  res: Response,
  filename: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  source: AsyncIterable<T> | Iterable<T>,
): Promise<void> {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  const sheet = workbook.addWorksheet(sheetName.slice(0, 28) || "Sheet1");

  sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  for await (const row of iterate(source)) {
    const values: Record<string, XlsxCell> = {};
    for (const col of columns) {
      const v = col.accessor(row);
      if (v === null || v === undefined) {
        values[col.key] = "";
      } else if (v instanceof Date) {
        values[col.key] = v;
      } else if (typeof v === "string") {
        values[col.key] = defangSpreadsheetCell(v);
      } else {
        values[col.key] = v;
      }
    }
    sheet.addRow(values).commit();
  }

  await sheet.commit();
  await workbook.commit();
}

export async function streamExport<T>(
  res: Response,
  format: "csv" | "xlsx",
  baseName: string,
  sheetName: string,
  columns: ExportColumn<T>[],
  source: AsyncIterable<T> | Iterable<T>,
): Promise<void> {
  const filename = buildExportFilename(baseName, format);
  if (format === "xlsx") {
    await streamXlsx(res, filename, sheetName, columns, source);
  } else {
    await streamCsv(res, filename, columns, source);
  }
}
