import type { Accumulator, ParsedResult } from "./types";

function add(map: Record<string, number>, key: string, inc: number) {
  if (!key) return;
  map[key] = (map[key] ?? 0) + inc;
}

export function createAccumulator(): Accumulator {
  return {
    advisors: new Set<string>(),

    openRos: {},

    menuCount: {},
    menuLaborGross: {},
    menuPartsGross: {},

    alaCount: {},
    alaLaborGross: {},
    alaPartsGross: {},

    recCount: {},
    recSoldCount: {},
    recAmount: {},
    recSoldAmount: {},

    dailyLaborGross: {},
    dailyPartsGross: {},

    commodities: {}
  };
}

export function applyParsedResult(acc: Accumulator, parsed: ParsedResult) {
  switch (parsed.type) {
    case "roCount": {
      for (const [adv, v] of Object.entries(parsed.data.openRosByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.openRos, adv, v);
      }
      return;
    }
    case "menuSales": {
      for (const [adv, v] of Object.entries(parsed.data.menuCountByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.menuCount, adv, v);
      }
      for (const [adv, v] of Object.entries(parsed.data.menuLaborGrossByAdvisor)) add(acc.menuLaborGross, adv, v);
      for (const [adv, v] of Object.entries(parsed.data.menuPartsGrossByAdvisor)) add(acc.menuPartsGross, adv, v);
      return;
    }
    case "alaCarte": {
      for (const [adv, v] of Object.entries(parsed.data.alaCountByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.alaCount, adv, v);
      }
      for (const [adv, v] of Object.entries(parsed.data.alaLaborGrossByAdvisor)) add(acc.alaLaborGross, adv, v);
      for (const [adv, v] of Object.entries(parsed.data.alaPartsGrossByAdvisor)) add(acc.alaPartsGross, adv, v);
      return;
    }
    case "recommendations": {
      for (const [adv, v] of Object.entries(parsed.data.recCountByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.recCount, adv, v);
      }
      for (const [adv, v] of Object.entries(parsed.data.recSoldCountByAdvisor)) add(acc.recSoldCount, adv, v);
      for (const [adv, v] of Object.entries(parsed.data.recAmountByAdvisor)) add(acc.recAmount, adv, v);
      for (const [adv, v] of Object.entries(parsed.data.recSoldAmountByAdvisor)) add(acc.recSoldAmount, adv, v);
      return;
    }
    case "dailyDataOld":
    case "dailyDataNew": {
      for (const [adv, v] of Object.entries(parsed.data.dailyLaborGrossByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.dailyLaborGross, adv, v);
      }
      for (const [adv, v] of Object.entries(parsed.data.dailyPartsGrossByAdvisor)) add(acc.dailyPartsGross, adv, v);
      return;
    }
    case "commodity": {
      const k = parsed.data.commodityKey;
      acc.commodities[k] = acc.commodities[k] ?? { qty: {}, gross: {}, laborGross: {} };
      for (const [adv, v] of Object.entries(parsed.data.qtyByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.commodities[k].qty, adv, v);
      }
      for (const [adv, v] of Object.entries(parsed.data.grossByAdvisor)) add(acc.commodities[k].gross, adv, v);
      for (const [adv, v] of Object.entries(parsed.data.laborGrossByAdvisor)) add(acc.commodities[k].laborGross, adv, v);
      return;
    }
    case "alignment": {
      const k = "alignments";
      acc.commodities[k] = acc.commodities[k] ?? { qty: {}, gross: {}, laborGross: {} };
      for (const [adv, v] of Object.entries(parsed.data.qtyByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.commodities[k].qty, adv, v);
      }
      for (const [adv, v] of Object.entries(parsed.data.partsGrossByAdvisor)) add(acc.commodities[k].gross, adv, v);
      for (const [adv, v] of Object.entries(parsed.data.laborGrossByAdvisor)) add(acc.commodities[k].laborGross, adv, v);
      return;
    }
    case "tires": {
      const k = "tires";
      acc.commodities[k] = acc.commodities[k] ?? { qty: {}, gross: {}, laborGross: {} };
      for (const [adv, v] of Object.entries(parsed.data.qtyByAdvisor)) {
        acc.advisors.add(adv);
        add(acc.commodities[k].qty, adv, v);
      }
      for (const [adv, v] of Object.entries(parsed.data.grossByAdvisor)) add(acc.commodities[k].gross, adv, v);
      return;
    }
    case "unknown":
      return;
  }
}


