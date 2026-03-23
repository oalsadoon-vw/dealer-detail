export function normalizeAdvisorName(name: unknown): string {
  if (name == null) return "";
  return String(name).trim().toUpperCase();
}

export function isTotalRow(nameNormalized: string): boolean {
  return nameNormalized.trim().toUpperCase() === "TOTAL";
}

/**
 * Port of Streamlit `clean_column_data`:
 * - remove $ and commas
 * - blanks / NaN => 0
 */
export function cleanCurrency(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value).trim();
  if (!s) return 0;
  const cleaned = s.replace(/[\$,]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function cleanNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value).trim().replace(/,/g, "");
  if (!s) return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}


