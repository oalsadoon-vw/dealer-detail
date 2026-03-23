export type FullPicture = {
  menuSalesPct: number;
  alaPct: number;
  commodityQtyTotal: number;
  commodityPct: number;
  recClosingPct: number;
  totalDailyGross: number;
};

export function computeFullPicture(args: {
  openRos: number;
  menuCount: number;
  alaCount: number;
  recAmount: number;
  recSoldAmount: number;
  dailyLaborGross: number;
  dailyPartsGross: number;
  commodities: Array<{ commodityKey: string; qty: number; gross: number }>;
  excludeCommodityKeys?: string[];
}): FullPicture {
  const denom = args.openRos || 0;
  const safeDiv = (n: number, d: number) => (d === 0 ? 0 : n / d);

  const exclude = new Set((args.excludeCommodityKeys ?? []).map((k) => k.toLowerCase()));
  const commodityQtyTotal = args.commodities
    .filter((c) => !exclude.has(c.commodityKey.toLowerCase()))
    .reduce((sum, c) => sum + (c.qty || 0), 0);

  return {
    menuSalesPct: safeDiv(args.menuCount, denom),
    alaPct: safeDiv(args.alaCount, denom),
    commodityQtyTotal,
    commodityPct: safeDiv(commodityQtyTotal, denom),
    recClosingPct: safeDiv(args.recSoldAmount, args.recAmount),
    totalDailyGross: (args.dailyLaborGross || 0) + (args.dailyPartsGross || 0)
  };
}


