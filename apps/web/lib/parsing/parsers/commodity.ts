import { cleanCurrency, isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

function findCommodityColumns(headers: string[]) {
  let advisorCol: string | null = null;
  let qtyCol: string | null = null;
  let grossCol: string | null = null;
  let laborGrossCol: string | null = null;

  for (const col of headers) {
    const c = col.toLowerCase();
    if (!advisorCol) {
      if (c === "primary advisor name") advisorCol = col;
      else if (c.includes("advisor") && c.includes("name")) advisorCol = col;
      else if (c.includes("service advisor")) advisorCol = col;
    }

    if (!qtyCol) {
      if (c.includes("part count") || c.includes("actual quantity")) qtyCol = col;
      else if (c === "qty" || c.includes("quantity")) qtyCol = col;
    }

    if (!grossCol) {
      if (c === "gross" || c.endsWith(" gross") || c.includes("gross")) grossCol = col;
    }

    if (!laborGrossCol) {
      if (c.includes("labor") && c.includes("gross")) laborGrossCol = col;
      if (c.includes("opcode") && c.includes("labor") && c.includes("gross")) laborGrossCol = col;
    }
  }

  return { advisorCol, qtyCol, grossCol, laborGrossCol };
}

export function parseCommodity(args: { rows: Record<string, unknown>[]; headers: string[]; commodityKey: string }): ParsedResult {
  const { advisorCol, qtyCol, grossCol, laborGrossCol } = findCommodityColumns(args.headers);
  if (!advisorCol || !grossCol) {
    return {
      type: "unknown",
      data: { reason: "Commodity columns not found", debug: { advisorCol, qtyCol, grossCol, laborGrossCol } }
    };
  }

  const qtyByAdvisor: Record<string, number> = {};
  const grossByAdvisor: Record<string, number> = {};
  const laborGrossByAdvisor: Record<string, number> = {};

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[advisorCol]);
    if (!adv || isTotalRow(adv)) continue;

    const qty = qtyCol ? Number(row[qtyCol] ?? 0) : 1;
    qtyByAdvisor[adv] = (qtyByAdvisor[adv] ?? 0) + (Number.isFinite(qty) ? qty : 1);
    grossByAdvisor[adv] = (grossByAdvisor[adv] ?? 0) + cleanCurrency(row[grossCol]);
    if (laborGrossCol) {
      laborGrossByAdvisor[adv] = (laborGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[laborGrossCol]);
    }
  }

  return { type: "commodity", data: { commodityKey: args.commodityKey, qtyByAdvisor, grossByAdvisor, laborGrossByAdvisor } };
}


