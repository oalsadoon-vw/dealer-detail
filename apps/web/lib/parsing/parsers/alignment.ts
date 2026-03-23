import { cleanCurrency, isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

function findAlignmentColumns(headers: string[]) {
  let advisorCol: string | null = null;
  let storyCol: string | null = null;
  let laborGrossCol: string | null = null;
  let partsGrossCol: string | null = null;
  let grossCol: string | null = null;

  for (const col of headers) {
    const c = col.toLowerCase();
    if (!advisorCol && c.includes("advisor") && c.includes("name")) advisorCol = col;
    if (!storyCol && (c.includes("tech") && c.includes("story"))) storyCol = col;

    if (!laborGrossCol && c.includes("labor") && c.includes("gross")) laborGrossCol = col;
    if (!partsGrossCol && c.includes("parts") && c.includes("gross")) partsGrossCol = col;

    if (!grossCol && c === "gross") grossCol = col;
  }

  return { advisorCol, storyCol, laborGrossCol, partsGrossCol, grossCol };
}

export function parseAlignment(args: { rows: Record<string, unknown>[]; headers: string[] }): ParsedResult {
  const { advisorCol, storyCol, laborGrossCol, partsGrossCol, grossCol } = findAlignmentColumns(args.headers);
  if (!advisorCol) {
    return { type: "unknown", data: { reason: "Alignment columns not found", debug: { advisorCol, storyCol, laborGrossCol, partsGrossCol, grossCol } } };
  }

  const qtyByAdvisor: Record<string, number> = {};
  const partsGrossByAdvisor: Record<string, number> = {};
  const laborGrossByAdvisor: Record<string, number> = {};

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[advisorCol]);
    if (!adv || isTotalRow(adv)) continue;

    // Some alignment exports include a story column; if present, only count "wheel alignment" rows.
    // Otherwise treat each row as an alignment sale row.
    const includeRow = storyCol ? String(row[storyCol] ?? "").toLowerCase().includes("wheel alignment") : true;
    if (!includeRow) continue;

    qtyByAdvisor[adv] = (qtyByAdvisor[adv] ?? 0) + 1;

    // If present, sum labor/parts gross for parity with legacy "commodities labor/parts gross" rollups.
    if (laborGrossCol) laborGrossByAdvisor[adv] = (laborGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[laborGrossCol]);
    if (partsGrossCol) partsGrossByAdvisor[adv] = (partsGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[partsGrossCol]);
    else if (grossCol) partsGrossByAdvisor[adv] = (partsGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[grossCol]);
  }

  return { type: "alignment", data: { qtyByAdvisor, partsGrossByAdvisor, laborGrossByAdvisor } };
}


