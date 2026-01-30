import * as XLSX from "xlsx";

export type XlsxReadOptions = {
  /**
   * 0-based row index to start reading from (SheetJS `range` option).
   * For GM tires (pd.read_excel(skiprows=2, header=0)), use `rangeStartRow: 2`.
   */
  rangeStartRow?: number;
};

export type SheetTable = {
  sheetName: string;
  rows: Record<string, unknown>[];
  headers: string[];
};

function normalizeHeader(h: unknown): string {
  return String(h ?? "").trim();
}

export function listSheetNames(buf: Buffer): string[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames ?? [];
}

export function readFirstSheetAsTable(buf: Buffer, opts: XlsxReadOptions = {}): SheetTable {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return { sheetName: "UNKNOWN", rows: [], headers: [] };
  return readSheetAsTable(buf, sheetName, opts);
}

export function readSheetAsTable(buf: Buffer, sheetName: string, opts: XlsxReadOptions = {}): SheetTable {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[sheetName];
  if (!ws) return { sheetName, rows: [], headers: [] };

  // `defval: ""` keeps keys present; `raw: false` stringifies dates/numbers consistently for detection.
  const rangeStartRow = Math.max(0, opts.rangeStartRow ?? 0);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
    range: rangeStartRow
  });

  // Extract headers reliably even if rows are empty by using raw sheet data
  const rawRows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    range: rangeStartRow
  });
  const headers = (rawRows[0] ?? []).map(normalizeHeader).filter(Boolean);

  return { sheetName, rows, headers };
}


