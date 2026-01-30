import type { DetectResult, ReportType } from "./types";

function lowerSet(headers: string[]): Set<string> {
  return new Set(headers.map((h) => h.trim().toLowerCase()).filter(Boolean));
}

function hasAll(h: Set<string>, cols: string[]): boolean {
  return cols.every((c) => h.has(c.toLowerCase()));
}

function hasAny(h: Set<string>, cols: string[]): boolean {
  return cols.some((c) => h.has(c.toLowerCase()));
}

function filenameLower(filename?: string): string {
  return (filename ?? "").toLowerCase();
}

function filenameHintKey(filename?: string): string {
  // Normalize for fuzzy contains checks: keep alphanumerics only.
  return filenameLower(filename).replace(/[^a-z0-9]+/g, "");
}

function hasColLike(h: Set<string>, includesAll: string[]) {
  for (const col of h) {
    const ok = includesAll.every((needle) => col.includes(needle.toLowerCase()));
    if (ok) return true;
  }
  return false;
}

function hasTwoWord(h: Set<string>, w1: string, w2: string) {
  return hasColLike(h, [w1, w2]);
}

export function detectReportType(args: {
  headers: string[];
  filename?: string;
  sheetName?: string;
}): DetectResult {
  const h = lowerSet(args.headers);
  const fname = filenameLower(args.filename);
  const fkey = filenameHintKey(args.filename);
  const sname = filenameLower(args.sheetName);

  // Shared helpers
  const hasLaborGross = h.has("labor gross") || hasTwoWord(h, "labor", "gross");
  const hasPartsGross = h.has("parts gross") || hasTwoWord(h, "parts", "gross");
  const hasPayType = h.has("pay type") || hasTwoWord(h, "pay", "type");
  const hasName = h.has("name");
  const hasServiceAdvisor = h.has("service advisor") || hasColLike(h, ["service", "advisor"]);
  const hasRoNumber = h.has("ro number") || hasColLike(h, ["ro", "number"]);
  const hasAdvisorName = h.has("advisor name") || hasColLike(h, ["advisor", "name"]);
  const hasOpcode = hasAny(h, ["opcode labor gross", "opcode parts gross", "operation opcode"]);
  const hasAnyGross = [...h].some((x) => x.includes("gross"));
  const hasAdvisorNameLike = [...h].some((x) => x.includes("advisor") && x.includes("name"));

  // 1. High Priority Overrides (Alignment)
  const isAlignmentFilename = fname.includes("alignment") || fkey.includes("alignment") || sname.includes("alignment");
  if (isAlignmentFilename) {
    return {
      type: "alignment",
      confidence: 0.95,
      notes: ["Matched alignment via title override"]
    };
  }

  // 2. Filename-First Detection with Column Validation

  // Menu Sales
  const isMenuFilename = fname.includes("menu sales") || fkey.includes("menusales") || fname.includes("closed menu") || fkey.includes("closedmenu") || (fname.includes("menu") && fname.includes("sales"));
  if (isMenuFilename && (hasAdvisorNameLike || hasAdvisorName)) {
    return {
      type: "menuSales",
      confidence: 0.95,
      notes: ["Matched menuSales via filename hint"]
    };
  }

  // A La Carte
  const isAlaFilename = fname.includes("a-la-carte") || fname.includes("ala carte") || fkey.includes("alacarte") || fkey.includes("alacart") || fname.includes("a-la-cart");
  if (isAlaFilename && (hasAdvisorNameLike || hasAdvisorName)) {
    return {
      type: "alaCarte",
      confidence: 0.95,
      notes: ["Matched alaCarte via filename hint"]
    };
  }

  // RO Count
  const isRoCountFilename = fkey.includes("openrocount") || fkey.includes("dailyopenrocount") || (fkey.includes("openro") && fkey.includes("count")) || fname.includes("open ro count") || fname.includes("repair order count") || fkey.includes("openrepairordercount");
  if (isRoCountFilename && hasAdvisorName && hasRoNumber) {
    return {
      type: "roCount",
      confidence: 0.95,
      notes: ["Matched roCount via filename hint"]
    };
  }

  // Recommendations
  const isRecFilename = fname.includes("recommendation") || fkey.includes("recommendation") || sname.includes("recommendation");
  if (isRecFilename && (h.has("recommendations") || h.has("recommendations sold $ amount"))) {
    return {
      type: "recommendations",
      confidence: 0.95,
      notes: ["Matched recommendations via filename hint"]
    };
  }

  // Daily Data
  const isDailyFilename = fname.includes("performance") || fkey.includes("performance") || fname.includes("daily") || fkey.includes("daily");
  if (isDailyFilename) {
    if (hasPayType && hasName) {
      return { type: "dailyDataOld", confidence: 0.95, notes: ["Matched daily (old) via filename + headers"] };
    }
    if (hasServiceAdvisor) {
      return { type: "dailyDataNew", confidence: 0.95, notes: ["Matched daily (new) via filename + headers"] };
    }
  }

  // Tires
  const isTireFilename = fkey.includes("tire") || fname.includes("tire") || sname.includes("tire");
  if (isTireFilename && hasAdvisorNameLike && hasAnyGross) {
    return { type: "tires", confidence: 0.9, notes: ["Matched tires via filename hint"] };
  }

  // 3. Header-Only Fallbacks (for generic filenames like "Export.xlsx")

  if (h.has("recommendations sold $ amount") || (h.has("recommendations") && h.has("recommendations sold"))) {
    return { type: "recommendations", confidence: 0.85, notes: ["Matched recommendations via columns"] };
  }

  if (hasPayType && hasLaborGross && hasPartsGross && hasName) {
    return { type: "dailyDataOld", confidence: 0.85, notes: ["Matched old daily data columns"] };
  }
  if (hasServiceAdvisor && hasLaborGross && hasPartsGross) {
    return { type: "dailyDataNew", confidence: 0.85, notes: ["Matched new daily data columns"] };
  }

  if (hasAdvisorName && hasOpcode && hasRoNumber) {
    // If we have RO Number and Opcode and Advisor, it's very likely Menu Sales
    return { type: "menuSales", confidence: 0.7, notes: ["Ambiguous: Resolved as menuSales based on Opcode+RO"] };
  }

  if (hasAdvisorName && hasOpcode && !hasRoNumber) {
    return { type: "alaCarte", confidence: 0.7, notes: ["Ambiguous: Resolved as alaCarte (Opcode present, no RO)"] };
  }

  if (hasAdvisorName && hasRoNumber && !hasOpcode && !hasAnyGross) {
    return { type: "roCount", confidence: 0.7, notes: ["Ambiguous: Resolved as roCount (No Opcode/Gross)"] };
  }

  // Generic Commodity
  const hasGross = h.has("gross") || [...h].some((x) => x.includes(" gross") || x.includes("gross"));
  if ((h.has("primary advisor name") || hasAdvisorNameLike) && hasGross) {
    return { type: "commodity", confidence: 0.6, notes: ["Matched generic commodity columns"] };
  }

  return { type: "unknown", confidence: 0.1, notes: ["No detector matched"] };
}

export function inferCommodityKeyFromFilename(filename: string): string | null {
  const f = filenameLower(filename);
  const mapping: Array<[string, string]> = [
    ["air filter", "air_filters"],
    ["air filters", "air_filters"],
    ["cabin filter", "cabin_filters"],
    ["cabin filters", "cabin_filters"],
    ["battery", "batteries"],
    ["batteries", "batteries"],
    ["brake", "brakes"],
    ["brakes", "brakes"],
    ["alignment", "alignments"],
    ["alignments", "alignments"],
    ["wiper", "wipers"],
    ["wipers", "wipers"],
    ["belt", "belts"],
    ["belts", "belts"],
    ["fluid", "fluids"],
    ["fluids", "fluids"],
    ["factory chemical", "factory_chemicals"],
    ["factory chemicals", "factory_chemicals"],
    ["chemical", "factory_chemicals"],
    ["tires", "tires"],
    ["tire", "tires"]
  ];
  for (const [needle, key] of mapping) {
    if (f.includes(needle)) return key;
  }
  return null;
}


