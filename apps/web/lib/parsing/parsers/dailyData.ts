import { cleanCurrency, isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

function findDailyColumns(headers: string[]) {
  let nameCol: string | null = null; // old
  let serviceAdvisorCol: string | null = null; // new
  let payTypeCol: string | null = null;
  let laborGrossCol: string | null = null;
  let partsGrossCol: string | null = null;

  for (const col of headers) {
    const c = col.toLowerCase();
    if (!serviceAdvisorCol && c.includes("service") && c.includes("advisor")) serviceAdvisorCol = col;
    if (!nameCol && c === "name") nameCol = col;
    if (!payTypeCol && c.includes("pay") && c.includes("type")) payTypeCol = col;
    if (!laborGrossCol && c.includes("labor") && c.includes("gross")) laborGrossCol = col;
    if (!partsGrossCol && c.includes("parts") && c.includes("gross")) partsGrossCol = col;
  }

  return { nameCol, serviceAdvisorCol, payTypeCol, laborGrossCol, partsGrossCol };
}

export function parseDailyDataOld(args: { rows: Record<string, unknown>[]; headers: string[] }): ParsedResult {
  const { nameCol, payTypeCol, laborGrossCol, partsGrossCol } = findDailyColumns(args.headers);
  if (!nameCol || !payTypeCol || !laborGrossCol || !partsGrossCol) {
    return {
      type: "unknown",
      data: { reason: "Daily (old) columns not found", debug: { nameCol, payTypeCol, laborGrossCol, partsGrossCol } }
    };
  }

  const dailyLaborGrossByAdvisor: Record<string, number> = {};
  const dailyPartsGrossByAdvisor: Record<string, number> = {};

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[nameCol]);
    if (!adv || isTotalRow(adv)) continue;
    const payType = String(row[payTypeCol] ?? "").trim().toUpperCase();
    if (payType !== "ALL") continue;

    dailyLaborGrossByAdvisor[adv] = (dailyLaborGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[laborGrossCol]);
    dailyPartsGrossByAdvisor[adv] = (dailyPartsGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[partsGrossCol]);
  }

  return { type: "dailyDataOld", data: { dailyLaborGrossByAdvisor, dailyPartsGrossByAdvisor } };
}

export function parseDailyDataNew(args: { rows: Record<string, unknown>[]; headers: string[] }): ParsedResult {
  const { serviceAdvisorCol, laborGrossCol, partsGrossCol } = findDailyColumns(args.headers);
  if (!serviceAdvisorCol || !laborGrossCol || !partsGrossCol) {
    return {
      type: "unknown",
      data: { reason: "Daily (new) columns not found", debug: { serviceAdvisorCol, laborGrossCol, partsGrossCol } }
    };
  }

  const dailyLaborGrossByAdvisor: Record<string, number> = {};
  const dailyPartsGrossByAdvisor: Record<string, number> = {};

  for (const row of args.rows) {
    const adv = normalizeAdvisorName(row[serviceAdvisorCol]);
    if (!adv || isTotalRow(adv)) continue;

    dailyLaborGrossByAdvisor[adv] = (dailyLaborGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[laborGrossCol]);
    dailyPartsGrossByAdvisor[adv] = (dailyPartsGrossByAdvisor[adv] ?? 0) + cleanCurrency(row[partsGrossCol]);
  }

  return { type: "dailyDataNew", data: { dailyLaborGrossByAdvisor, dailyPartsGrossByAdvisor } };
}


