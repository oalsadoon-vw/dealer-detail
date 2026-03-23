import { describe, expect, it } from "vitest";

import { cleanCurrency, detectReportType } from "../lib/parsing";
import { parseRoCount } from "../lib/parsing/parsers/roCount";
import { parseAlignment } from "../lib/parsing/parsers/alignment";

describe("cleanCurrency", () => {
  it("removes $ and commas", () => {
    expect(cleanCurrency("$1,234.50")).toBeCloseTo(1234.5);
  });

  it("handles blanks", () => {
    expect(cleanCurrency("")).toBe(0);
    expect(cleanCurrency(null)).toBe(0);
  });
});

describe("unique RO counting", () => {
  it("counts unique (advisor, ro)", () => {
    const rows = [
      { "Advisor Name": "Alice", "RO Number": "1" },
      { "Advisor Name": "Alice", "RO Number": "1" },
      { "Advisor Name": "Alice", "RO Number": "2" },
      { "Advisor Name": "Bob", "RO Number": "1" }
    ];
    const parsed = parseRoCount({ rows, headers: ["Advisor Name", "RO Number"] });
    expect(parsed.type).toBe("roCount");
    if (parsed.type !== "roCount") throw new Error("unexpected");
    expect(parsed.data.openRosByAdvisor["ALICE"]).toBe(2);
    expect(parsed.data.openRosByAdvisor["BOB"]).toBe(1);
  });
});

describe("daily data detection (old vs new)", () => {
  it("detects old format", () => {
    const d = detectReportType({ headers: ["Name", "Pay Type", "Labor Gross", "Parts Gross"], filename: "daily.xlsx" });
    expect(d.type).toBe("dailyDataOld");
  });
  it("detects new format", () => {
    const d = detectReportType({ headers: ["Service Advisor", "Labor Gross", "Parts Gross"], filename: "daily.xlsx" });
    expect(d.type).toBe("dailyDataNew");
  });
  it("detects new format with column variations", () => {
    const d = detectReportType({ headers: ["Service Advisor Name", "Labor Gross $", "Parts Gross $"], filename: "Advisor Performance Report 3.0.xlsx" });
    expect(d.type).toBe("dailyDataNew");
  });
  it("does not misclassify old advisor performance as new", () => {
    const d = detectReportType({
      headers: ["Name", "Pay Type", "Labor Gross", "Parts Gross"],
      filename: "Advisor Performance Report.xlsx",
      sheetName: "Summary"
    });
    expect(d.type).toBe("dailyDataOld");
  });
});

describe("filename-driven disambiguation", () => {
  it("never classifies menu files as alignment even if tech story column exists", () => {
    const d = detectReportType({
      filename: "BST Menu Sales -Script (1).xlsx",
      sheetName: "ReportBuilder_Report",
      headers: ["Advisor Name", "Operation Tech Story", "RO Number", "Opcode Labor Gross", "Opcode Parts Gross"]
    });
    expect(d.type).toBe("menuSales");
  });

  it("classifies 'Alignments A La Carte' as alignment (commodity alignments)", () => {
    const d = detectReportType({
      filename: "BST Alignments A La Carte - Script.xlsx",
      sheetName: "ReportBuilder_Report",
      headers: ["Advisor Name", "RO Number", "Operation Tech Story"]
    });
    expect(d.type).toBe("alignment");
  });

  it("detects tire sales by filename even when quantity column is missing", () => {
    const d = detectReportType({
      filename: "Tire Sales Report-Script.xlsx",
      sheetName: "ReportBuilder_Report",
      headers: ["Advisor Name", "Gross"]
    });
    expect(d.type).toBe("tires");
  });
});

describe("alignment story matching", () => {
  it("counts rows whose story contains wheel alignment", () => {
    const parsed = parseAlignment({
      headers: ["Advisor Name", "Operation Tech Story"],
      rows: [
        { "Advisor Name": "Alice", "Operation Tech Story": "Customer needs WHEEL ALIGNMENT ASAP" },
        { "Advisor Name": "Alice", "Operation Tech Story": "Oil change" },
        { "Advisor Name": "Bob", "Operation Tech Story": "wheel alignment recommended" }
      ]
    });
    expect(parsed.type).toBe("alignment");
    if (parsed.type !== "alignment") throw new Error("unexpected");
    expect(parsed.data.qtyByAdvisor["ALICE"]).toBe(1);
    expect(parsed.data.qtyByAdvisor["BOB"]).toBe(1);
  });
});


describe("SCVW Open Repair Order Count detection", () => {
  it("detects SCVW Open Repair Order Count as roCount despite extra columns", () => {
    const headers = [
      'RO Created Date', 'Advisor Name', 'RO Number', 'Operation OpCode',
      'Operation Tech Story', 'Year', 'Model', 'Mileage In',
      'Opcode Labor Gross', 'Opcode Parts Gross', 'Opcode Labor Price', 'Opcode Parts Price'
    ];
    const filename = "SCVW Open Repair Order Count.xlsx";

    const result = detectReportType({ headers, filename });
    expect(result.type).toBe("roCount");
  });
});
