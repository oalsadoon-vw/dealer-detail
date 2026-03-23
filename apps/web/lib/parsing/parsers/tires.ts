import { cleanCurrency, cleanNumber, isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

function findTiresColumns(headers: string[]) {
  let namesColumn: string | null = null;
  let quantityColumn: string | null = null;
  let grossColumn: string | null = null;

  for (const col of headers) {
    const c = col.toLowerCase();
    if (!namesColumn && ((c.includes("advisor") && c.includes("name")) || c.includes("service advisor"))) namesColumn = col;
    else if (
      !quantityColumn &&
      (c.includes("part count") ||
        c.includes("actual quantity") ||
        c === "qty" ||
        (c.includes("quantity") && !c.includes("order")) ||
        c.includes("units"))
    )
      quantityColumn = col;
    else if (
      !grossColumn &&
      (c.includes("opcode parts gross") ||
        c === "gross" ||
        c.includes(" gross") ||
        c.includes("sales amount") ||
        c.includes("sales $") ||
        (c.includes("amount") && !c.includes("discount")))
    )
      grossColumn = col;
  }

  return { namesColumn, quantityColumn, grossColumn };
}

export function parseTires(args: { rows: Record<string, unknown>[]; headers: string[] }): ParsedResult {
  const { namesColumn, quantityColumn, grossColumn } = findTiresColumns(args.headers);
  // Some Tekion tire exports don't have a clean quantity column; we can still parse by counting rows.
  if (!namesColumn || !grossColumn) {
    return { type: "unknown", data: { reason: "Tires columns not found" } };
  }

  const qtyByAdvisor: Record<string, number> = {};
  const grossByAdvisor: Record<string, number> = {};

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[namesColumn]);
    if (!adv || isTotalRow(adv)) continue;
    const qty = quantityColumn ? cleanNumber(row[quantityColumn]) : 1;
    qtyByAdvisor[adv] = (qtyByAdvisor[adv] ?? 0) + (qty || 0);
    grossByAdvisor[adv] = (grossByAdvisor[adv] ?? 0) + cleanCurrency(row[grossColumn]);
  }

  return { type: "tires", data: { qtyByAdvisor, grossByAdvisor } };
}


