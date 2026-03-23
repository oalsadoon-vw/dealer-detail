import { cleanCurrency, cleanNumber, isTotalRow, normalizeAdvisorName } from "../cleaners";
import type { ParsedResult } from "../types";

export function parseRecommendations(rows: Record<string, unknown>[]): ParsedResult {
  const recCountByAdvisor: Record<string, number> = {};
  const recSoldCountByAdvisor: Record<string, number> = {};
  const recAmountByAdvisor: Record<string, number> = {};
  const recSoldAmountByAdvisor: Record<string, number> = {};

  for (const row of rows) {
    const adv = normalizeAdvisorName(row["Name"]);
    if (!adv || isTotalRow(adv)) continue;

    recCountByAdvisor[adv] = (recCountByAdvisor[adv] ?? 0) + cleanNumber(row["Recommendations"]);
    recSoldCountByAdvisor[adv] = (recSoldCountByAdvisor[adv] ?? 0) + cleanNumber(row["Recommendations Sold"]);
    recAmountByAdvisor[adv] = (recAmountByAdvisor[adv] ?? 0) + cleanCurrency(row["Recommendations $ amount"]);
    recSoldAmountByAdvisor[adv] = (recSoldAmountByAdvisor[adv] ?? 0) + cleanCurrency(row["Recommendations Sold $ amount"]);
  }

  return {
    type: "recommendations",
    data: { recCountByAdvisor, recSoldCountByAdvisor, recAmountByAdvisor, recSoldAmountByAdvisor }
  };
}


