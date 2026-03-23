import fs from "node:fs/promises";
import path from "node:path";

import { parseExcelFile } from "../lib/parsing/parsingPipeline";

type ExpectedType =
  | "menuSales"
  | "alaCarte"
  | "commodity"
  | "tires"
  | "alignment"
  | "recommendations"
  | "roCount"
  | "dailyDataOld"
  | "dailyDataNew"
  | "unknown";

function expectedTypeFromPath(filePath: string): ExpectedType {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();

  // Root folders
  if (normalized.includes("/menu/")) return "menuSales";
  if (normalized.includes("/a-la-cart/")) return "alaCarte";
  if (normalized.includes("/rec/")) return "recommendations";
  if (normalized.includes("/ro/")) return "roCount";
  if (normalized.includes("/daily/")) return "dailyDataOld";

  // Commodity variants
  if (normalized.includes("/comodities/alignments/")) return "alignment";
  if (normalized.includes("/comodities/")) {
    const base = path.basename(normalized);
    if (base.includes("tire")) return "tires";
    return "commodity";
  }

  return "unknown";
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function isExcelFile(filePath: string) {
  const lower = filePath.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(1) : String(n);
}

async function main() {
  const baseDir = process.argv[2] ?? "/Users/omaralsadoon/Desktop/excels";
  const rows: Array<{
    file: string;
    expected: ExpectedType;
    detected: string;
    confidence: number;
    usedSheet: string;
    rangeStartRow: number;
    rowCount: number;
    notes: string;
  }> = [];

  for await (const filePath of walk(baseDir)) {
    if (!isExcelFile(filePath)) continue;

    const expected = expectedTypeFromPath(filePath);
    const filename = path.basename(filePath);
    const buffer = await fs.readFile(filePath);

    const parsed = parseExcelFile({ buffer, filename });

    rows.push({
      file: filePath,
      expected,
      detected: parsed.detect.type,
      confidence: parsed.detect.confidence,
      usedSheet: parsed.raw.usedSheetName,
      rangeStartRow: parsed.raw.rangeStartRow,
      rowCount: parsed.raw.rowCount,
      notes: parsed.detect.notes.join(" | ")
    });
  }

  rows.sort((a, b) => {
    const expectedOk = (expected: ExpectedType, detected: string) => {
      if (expected === "dailyDataOld" && (detected === "dailyDataOld" || detected === "dailyDataNew")) return true;
      return detected === expected;
    };

    const aMismatch = a.expected !== "unknown" && !expectedOk(a.expected, a.detected);
    const bMismatch = b.expected !== "unknown" && !expectedOk(b.expected, b.detected);
    if (aMismatch !== bMismatch) return aMismatch ? -1 : 1;
    return a.file.localeCompare(b.file);
  });

  const mismatches = rows.filter((r) => {
    if (r.expected === "unknown") return false;
    if (r.expected === "dailyDataOld") return !(r.detected === "dailyDataOld" || r.detected === "dailyDataNew");
    return r.detected !== r.expected;
  });
  console.log(`Scanned ${rows.length} Excel files under ${baseDir}`);
  console.log(`Mismatches: ${mismatches.length}\n`);

  for (const r of mismatches) {
    console.log(
      [
        `MISMATCH expected=${r.expected} detected=${r.detected} conf=${fmt(r.confidence)}`,
        `file=${r.file}`,
        `sheet=${r.usedSheet} startRow=${r.rangeStartRow} rows=${r.rowCount}`,
        `notes=${r.notes}`
      ].join("\n")
    );
    console.log("");
  }

  if (mismatches.length === 0) {
    // Still print a small summary so we can confirm coverage quickly.
    const byType = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.detected] = (acc[r.detected] ?? 0) + 1;
      return acc;
    }, {});
    console.log("Detected type counts:");
    for (const [k, v] of Object.entries(byType).sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`- ${k}: ${v}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


