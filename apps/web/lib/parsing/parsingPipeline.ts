import { detectReportType, inferCommodityKeyFromFilename } from "./detectors";
import type { DetectResult, ParsedResult } from "./types";
import { listSheetNames, readSheetAsTable } from "./xlsxReader";
import { parseAlaCarte } from "./parsers/alaCarte";
import { parseAlignment } from "./parsers/alignment";
import { parseCommodity } from "./parsers/commodity";
import { parseDailyDataNew, parseDailyDataOld } from "./parsers/dailyData";
import { parseMenuSales } from "./parsers/menuSales";
import { parseRecommendations } from "./parsers/recommendations";
import { parseRoCount } from "./parsers/roCount";
import { parseTires } from "./parsers/tires";

export type ParsedFile = {
  detect: DetectResult;
  parsed: ParsedResult;
  raw: {
    usedSheetName: string;
    rangeStartRow: number;
    headers: string[];
    rowCount: number;
    sheetNames: string[];
  };
  // Always provide the rows we stored in RawReportRow (first sheet / used sheet).
  rows: Record<string, unknown>[];
};

export function parseExcelFile(args: {
  buffer: Buffer;
  filename: string;
}): ParsedFile {
  const sheetNames = listSheetNames(args.buffer);
  const candidates: Array<{
    sheetName: string;
    rangeStartRow: number;
    headers: string[];
    rows: Record<string, unknown>[];
    detect: DetectResult;
  }> = [];

  // Scan all sheets + a few likely header offsets.
  const rangeStarts = [0, 1, 2, 3];
  for (const sheetName of sheetNames) {
    for (const rangeStartRow of rangeStarts) {
      const table = readSheetAsTable(args.buffer, sheetName, { rangeStartRow });
      const detect = detectReportType({ headers: table.headers, filename: args.filename, sheetName });
      candidates.push({ sheetName, rangeStartRow, headers: table.headers, rows: table.rows, detect });
    }
  }

  // Pick best: highest confidence; prefer non-unknown.
  const best =
    candidates
      .slice()
      .sort((a, b) => {
        if (a.detect.type === "unknown" && b.detect.type !== "unknown") return 1;
        if (a.detect.type !== "unknown" && b.detect.type === "unknown") return -1;
        return b.detect.confidence - a.detect.confidence;
      })[0] ??
    (() => {
      // No sheets? fall back to empty
      const detect: DetectResult = { type: "unknown", confidence: 0.1, notes: ["No sheets found"] };
      return { sheetName: "UNKNOWN", rangeStartRow: 0, headers: [], rows: [], detect };
    })();

  const detect = {
    ...best.detect,
    notes: [...best.detect.notes, `Selected sheet='${best.sheetName}' rangeStartRow=${best.rangeStartRow}`]
  };

  const parsed = parseByType({ type: detect.type, rows: best.rows, filename: args.filename, headers: best.headers });

  return {
    detect,
    parsed,
    raw: {
      usedSheetName: best.sheetName,
      rangeStartRow: best.rangeStartRow,
      headers: best.headers,
      rowCount: best.rows.length,
      sheetNames
    },
    rows: best.rows
  };
}

export function parseByType(args: {
  type: DetectResult["type"];
  rows: Record<string, unknown>[];
  headers: string[];
  filename: string;
}): ParsedResult {
  switch (args.type) {
    case "menuSales":
      return parseMenuSales({ rows: args.rows, headers: args.headers });
    case "alaCarte":
      return parseAlaCarte({ rows: args.rows, headers: args.headers });
    case "roCount":
      return parseRoCount({ rows: args.rows, headers: args.headers });
    case "recommendations":
      return parseRecommendations(args.rows);
    case "dailyDataOld":
      return parseDailyDataOld({ rows: args.rows, headers: args.headers });
    case "dailyDataNew":
      return parseDailyDataNew({ rows: args.rows, headers: args.headers });
    case "alignment":
      return parseAlignment({ rows: args.rows, headers: args.headers });
    case "commodity": {
      const key = inferCommodityKeyFromFilename(args.filename) ?? "commodity";
      return parseCommodity({ rows: args.rows, headers: args.headers, commodityKey: key });
    }
    case "tires":
      return parseTires({ rows: args.rows, headers: args.headers });
    default:
      return { type: "unknown", data: { reason: "Unsupported or unknown report type" } };
  }
}


