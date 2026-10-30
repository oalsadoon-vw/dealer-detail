"use client";

import * as XLSX from "xlsx";
import { toCsv, downloadCsv } from "@/lib/client/use-report";
import {
  buildWorkbook,
  buildExportFilename,
  generatedAtPT,
  type ExportColumn,
  type ExportMeta,
  type ExportSheet,
  type ExportTable,
} from "./export-workbook";

export {
  buildWorkbook,
  buildExportFilename,
  generatedAtPT,
  type ExportColumn,
  type ExportMeta,
  type ExportSheet,
  type ExportTable,
};

/** Download `rows` as CSV (header = column keys, or object keys when columns omitted). */
export function exportCsv(filename: string, rows: Record<string, unknown>[], columns?: ExportColumn[]) {
  downloadCsv(filename, toCsv(rows, columns?.map((c) => c.key)));
}

/** Download one workbook with a Filters sheet + one sheet per table. */
export function exportXlsx(filename: string, sheets: ExportSheet[], meta: ExportMeta) {
  const wb = buildWorkbook(sheets, meta);
  XLSX.writeFile(wb, filename);
}

/** PDF = the browser print dialog. Callers show a "Save as PDF" hint first. */
export function exportPdf() {
  window.print();
}