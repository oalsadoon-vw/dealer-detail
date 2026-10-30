import * as XLSX from "xlsx";

/**
 * Pure workbook construction for report exports — no DOM, no window, no Next.
 * Kept separate from lib/client/export.ts so `buildWorkbook` is testable from a
 * plain Node script (scripts/_xlsx_smoke.ts) without pulling in React/Next.
 */

export type ExportColumnType = "money" | "number" | "text" | "date";
export type ExportColumn = { key: string; label: string; type?: ExportColumnType };
export type ExportSheet = {
  name: string;
  rows: Record<string, unknown>[];
  columns?: ExportColumn[];
};
export type ExportMeta = {
  store: string;
  pageTitle: string;
  startDate: string;
  endDate: string;
  basis: string;
  statuses?: string[];
  payClasses?: string[];
  url: string;
};
/** A table registered by a report page for export. */
export type ExportTable = {
  id: string;
  name: string;
  rows: Record<string, unknown>[];
  columns?: ExportColumn[];
  primary?: boolean;
};

const MONEY_FMT = "#,##0.00";
const NUM_FMT = "#,##0.00";
const MAX_WIDTH = 60;

/** Timestamp in US-Pacific, used on the Filters sheet and in the print header. */
export function generatedAtPT(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

/** Excel sheet names: strip illegal chars, ≤31 chars, unique. */
function sanitizeSheetName(name: string): string {
  let s = name.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) s = "Sheet";
  return s.slice(0, 31);
}

function dedupe(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = seen.get(n) ?? 0;
    seen.set(n, count + 1);
    if (count === 0) return n;
    const suffix = ` (${count + 1})`;
    return n.slice(0, 31 - suffix.length) + suffix;
  });
}

function cellValue(v: unknown, type?: ExportColumnType): string | number | null {
  if (v == null || v === "") return null;
  if (type === "money" || type === "number") {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return String(v);
}

/**
 * Build an `xlsx` workbook: a "Filters" sheet first (store/range/basis/status/
 * pay/generated-at/URL as key→value rows), then one sheet per table with money
 * cells as numbers formatted `#,##0.00` and auto-sized columns (capped at 60).
 */
export function buildWorkbook(sheets: ExportSheet[], meta: ExportMeta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const filterRows: [string, string][] = [
    ["Store", meta.store],
    ["Page", meta.pageTitle],
    ["Start date", meta.startDate],
    ["End date", meta.endDate],
    ["Date basis", meta.basis],
    ["Statuses", (meta.statuses ?? []).join(", ") || "(all)"],
    ["Pay types", (meta.payClasses ?? []).join(", ") || "(all)"],
    ["Generated (PT)", generatedAtPT()],
    ["URL", meta.url],
  ];
  const fWs = XLSX.utils.aoa_to_sheet(filterRows.map(([k, v]) => [k, v]));
  fWs["!cols"] = [{ wch: 18 }, { wch: Math.min(MAX_WIDTH, meta.url.length + 2) }];
  XLSX.utils.book_append_sheet(wb, fWs, "Filters");

  const names = dedupe(sheets.map((s) => sanitizeSheetName(s.name)));

  sheets.forEach((sheet, idx) => {
    const columns: ExportColumn[] =
      sheet.columns ??
      Object.keys(sheet.rows[0] ?? {}).map((k) => ({ key: k, label: k, type: "text" as const }));
    const header = columns.map((c) => c.label);
    const aoa: (string | number | null)[][] = [header];
    for (const row of sheet.rows) {
      aoa.push(columns.map((c) => cellValue(row[c.key], c.type)));
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Numeric cells: keep as numbers with a `#,##0.00` display format.
    for (let r = 1; r < aoa.length; r++) {
      for (let c = 0; c < columns.length; c++) {
        const type = columns[c].type;
        if (type !== "money" && type !== "number") continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === "number") {
          cell.z = type === "money" ? MONEY_FMT : NUM_FMT;
        }
      }
    }

    // Auto column widths from the longest rendered value, capped at 60.
    ws["!cols"] = columns.map((col, c) => {
      let max = header[c].length;
      for (let r = 1; r < aoa.length; r++) {
        const v = aoa[r][c];
        const len = v == null ? 0 : String(v).length;
        if (len > max) max = len;
      }
      return { wch: Math.min(MAX_WIDTH, Math.max(col.type === "money" ? 10 : 8, max + 2)) };
    });

    XLSX.utils.book_append_sheet(wb, ws, names[idx]);
  });

  return wb;
}

/**
 * Filename convention: `AMG_<STOREABBR>_<report>_<start>_<end>_<basis>.xlsx|csv`.
 */
export function buildExportFilename(opts: {
  store?: string | null;
  report: string;
  startDate: string;
  endDate: string;
  basis?: string | null;
  ext: "xlsx" | "csv";
}): string {
  const store = (opts.store ?? "STORE").replace(/[^A-Za-z0-9_-]/g, "") || "STORE";
  const basis = opts.basis ?? "na";
  return `AMG_${store}_${opts.report}_${opts.startDate}_${opts.endDate}_${basis}.${opts.ext}`;
}