import { cleanCurrency, isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

function findAlaCarteColumns(headers: string[]) {
  let advisorCol: string | null = null;
  let laborGrossCol: string | null = null;
  let partsGrossCol: string | null = null;

  for (const col of headers) {
    const c = col.toLowerCase();
    if (!advisorCol && c.includes("advisor") && c.includes("name")) advisorCol = col;
    else if (!laborGrossCol && c.includes("labor") && c.includes("gross")) laborGrossCol = col;
    else if (!partsGrossCol && c.includes("parts") && c.includes("gross")) partsGrossCol = col;
  }

  return { advisorCol, laborGrossCol, partsGrossCol };
}

export function parseAlaCarte(args: { rows: Record<string, unknown>[]; headers: string[] }): ParsedResult {
  const { advisorCol, laborGrossCol, partsGrossCol } = findAlaCarteColumns(args.headers);
  if (!advisorCol || !laborGrossCol || !partsGrossCol) {
    return {
      type: "unknown",
      data: {
        reason: "A-La-Carte columns not found",
        debug: { advisorCol, laborGrossCol, partsGrossCol }
      }
    };
  }

  const alaCountByAdvisor: Record<string, number> = {};
  const alaLaborGrossByAdvisor: Record<string, number> = {};
  const alaPartsGrossByAdvisor: Record<string, number> = {};

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[advisorCol]);
    if (!adv || isTotalRow(adv)) continue;

    alaCountByAdvisor[adv] = (alaCountByAdvisor[adv] ?? 0) + 1;
    alaLaborGrossByAdvisor[adv] = (alaLaborGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[laborGrossCol]);
    alaPartsGrossByAdvisor[adv] = (alaPartsGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[partsGrossCol]);
  }

  return {
    type: "alaCarte",
    data: { alaCountByAdvisor, alaLaborGrossByAdvisor, alaPartsGrossByAdvisor }
  };
}


