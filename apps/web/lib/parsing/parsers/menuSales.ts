import { cleanCurrency, isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

function findMenuColumns(headers: string[]) {
  let advisorCol: string | null = null;
  let roCol: string | null = null;
  let laborGrossCol: string | null = null;
  let partsGrossCol: string | null = null;

  for (const col of headers) {
    const c = col.toLowerCase();
    if (!advisorCol && c.includes("advisor") && c.includes("name")) advisorCol = col;
    else if (!roCol && c.includes("ro") && c.includes("number")) roCol = col;
    else if (!laborGrossCol && c.includes("labor") && c.includes("gross")) laborGrossCol = col;
    else if (!partsGrossCol && c.includes("parts") && c.includes("gross")) partsGrossCol = col;
  }

  return { advisorCol, roCol, laborGrossCol, partsGrossCol };
}

export function parseMenuSales(args: { rows: Record<string, unknown>[]; headers: string[] }): ParsedResult {
  const { advisorCol, roCol, laborGrossCol, partsGrossCol } = findMenuColumns(args.headers);
  if (!advisorCol || !roCol || !laborGrossCol || !partsGrossCol) {
    return {
      type: "unknown",
      data: {
        reason: "Menu Sales columns not found",
        debug: { advisorCol, roCol, laborGrossCol, partsGrossCol }
      }
    };
  }

  const menuCountByAdvisor: Record<string, number> = {};
  const menuLaborGrossByAdvisor: Record<string, number> = {};
  const menuPartsGrossByAdvisor: Record<string, number> = {};

  const unique = new Set<string>(); // advisor|ro

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[advisorCol]);
    if (!adv || isTotalRow(adv)) continue;
    const ro = String(row[roCol] ?? "").trim();
    if (!ro) continue;

    const labor = cleanCurrency(row[laborGrossCol]);
    const parts = cleanCurrency(row[partsGrossCol]);

    // count unique (advisor, ro)
    const key = `${adv}|${ro}`;
    if (!unique.has(key)) {
      unique.add(key);
      menuCountByAdvisor[adv] = (menuCountByAdvisor[adv] ?? 0) + 1;
    }

    menuLaborGrossByAdvisor[adv] = (menuLaborGrossByAdvisor[adv] ?? 0) + labor;
    menuPartsGrossByAdvisor[adv] = (menuPartsGrossByAdvisor[adv] ?? 0) + parts;
  }

  return {
    type: "menuSales",
    data: { menuCountByAdvisor, menuLaborGrossByAdvisor, menuPartsGrossByAdvisor }
  };
}


