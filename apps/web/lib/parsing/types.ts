export type ReportType =
  | "menuSales"
  | "alaCarte"
  | "commodity"
  | "tires"
  | "alignment"
  | "recommendations"
  | "dailyDataOld"
  | "dailyDataNew"
  | "roCount"
  | "unknown";

export type DetectResult = {
  type: ReportType;
  confidence: number; // 0..1
  notes: string[];
  usedSheetName?: string;
};

export type ParsedMenuSales = {
  menuCountByAdvisor: Record<string, number>;
  menuLaborGrossByAdvisor: Record<string, number>;
  menuPartsGrossByAdvisor: Record<string, number>;
};

export type ParsedAlaCarte = {
  alaCountByAdvisor: Record<string, number>;
  alaLaborGrossByAdvisor: Record<string, number>;
  alaPartsGrossByAdvisor: Record<string, number>;
};

export type ParsedRoCount = {
  openRosByAdvisor: Record<string, number>;
};

export type ParsedRecommendations = {
  recCountByAdvisor: Record<string, number>;
  recSoldCountByAdvisor: Record<string, number>;
  recAmountByAdvisor: Record<string, number>;
  recSoldAmountByAdvisor: Record<string, number>;
};

export type ParsedDailyData = {
  dailyLaborGrossByAdvisor: Record<string, number>;
  dailyPartsGrossByAdvisor: Record<string, number>;
};

export type ParsedCommodity = {
  commodityKey: string;
  qtyByAdvisor: Record<string, number>;
  grossByAdvisor: Record<string, number>; // parts gross
  laborGrossByAdvisor: Record<string, number>;
};

export type ParsedAlignment = {
  qtyByAdvisor: Record<string, number>; // qty=count
  partsGrossByAdvisor: Record<string, number>;
  laborGrossByAdvisor: Record<string, number>;
};

export type ParsedTires = {
  qtyByAdvisor: Record<string, number>;
  grossByAdvisor: Record<string, number>;
};

export type ParsedResult =
  | { type: "menuSales"; data: ParsedMenuSales }
  | { type: "alaCarte"; data: ParsedAlaCarte }
  | { type: "roCount"; data: ParsedRoCount }
  | { type: "recommendations"; data: ParsedRecommendations }
  | { type: "dailyDataOld"; data: ParsedDailyData }
  | { type: "dailyDataNew"; data: ParsedDailyData }
  | { type: "commodity"; data: ParsedCommodity }
  | { type: "alignment"; data: ParsedAlignment }
  | { type: "tires"; data: ParsedTires }
  | { type: "unknown"; data: { reason: string; debug?: Record<string, unknown> } };

export type Accumulator = {
  advisors: Set<string>; // nameNormalized

  // metrics
  openRos: Record<string, number>;

  menuCount: Record<string, number>;
  menuLaborGross: Record<string, number>;
  menuPartsGross: Record<string, number>;

  alaCount: Record<string, number>;
  alaLaborGross: Record<string, number>;
  alaPartsGross: Record<string, number>;

  recCount: Record<string, number>;
  recSoldCount: Record<string, number>;
  recAmount: Record<string, number>;
  recSoldAmount: Record<string, number>;

  dailyLaborGross: Record<string, number>;
  dailyPartsGross: Record<string, number>;

  // commodities: commodityKey -> advisor -> {qty, partsGross, laborGross}
  commodities: Record<string, { qty: Record<string, number>; gross: Record<string, number>; laborGross: Record<string, number> }>;
};


