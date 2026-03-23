import { isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

function findRoCountColumns(headers: string[]) {
  let advisorCol: string | null = null;
  let roCol: string | null = null;

  for (const col of headers) {
    const c = col.toLowerCase();
    if (!advisorCol && c.includes("advisor") && c.includes("name")) advisorCol = col;
    else if (!roCol && c.includes("ro") && c.includes("number")) roCol = col;
  }

  return { advisorCol, roCol };
}

export function parseRoCount(args: { rows: Record<string, unknown>[]; headers: string[] }): ParsedResult {
  const { advisorCol, roCol } = findRoCountColumns(args.headers);
  if (!advisorCol || !roCol) {
    return {
      type: "unknown",
      data: { reason: "RO Count columns not found", debug: { advisorCol, roCol } }
    };
  }

  const openRosByAdvisor: Record<string, number> = {};
  const unique = new Set<string>();

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[advisorCol]);
    if (!adv || isTotalRow(adv)) continue;
    const ro = String(row[roCol] ?? "").trim();
    if (!ro) continue;

    const key = `${adv}|${ro}`;
    if (unique.has(key)) continue;
    unique.add(key);
    openRosByAdvisor[adv] = (openRosByAdvisor[adv] ?? 0) + 1;
  }

  return { type: "roCount", data: { openRosByAdvisor } };
}


