import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  groupJobsByRo,
  mapInternalRo,
  partCostCents,
  partNumberOf,
} from "../lib/sources/tekion/internal/mapper";
import { effectivePersona, normalizeDisplayName, parseInternalUser } from "../lib/sources/tekion/internal/client";
import { buildFactsFromPayload } from "../lib/facts/buildRoFacts";
import type { OpcodeMap } from "../lib/aggregate/opcodeClassifier";

const FIX = path.join(__dirname, "fixtures", "internal");
const live = JSON.parse(fs.readFileSync(path.join(FIX, "bc-105666.json"), "utf8"));
const openapi = JSON.parse(fs.readFileSync(path.join(FIX, "bc-105666.openapi.json"), "utf8"));

// Empty map: classification falls back to the strict TEK regex, which is the
// only part of classification this tie-out cares about.
const emptyMap: OpcodeMap = new Map();

describe("internal mapper — BC RO 105666 (live fixture 2026-10-22)", () => {
  const snap = mapInternalRo(live.header, live.jobs);

  it("drops deleted (voided) jobs and ties nonVoidedJobCount", () => {
    expect(live.jobs.length).toBe(9);
    expect(snap.jobs.length).toBe(5);
    expect(snap.jobs.length).toBe(live.header.nonVoidedJobCount);
    expect(snap.jobs.every((j) => j.job.status !== "OPEN")).toBe(true);
  });

  it("maps header → ro with true closedTime/invoicedTime + schedule", () => {
    expect(snap.ro.documentId).toBe("6ad39f8e764261330689c99e");
    expect(snap.ro.documentNumber).toBe("105666");
    expect(snap.ro.status).toBe("CLOSED");
    expect(snap.ro.type).toBe("APPOINTMENT");
    expect(snap.ro.closedTime).toBe(1792275940076);
    expect(snap.ro.invoicedTime).toBe(1792272072267);
    const sched = (snap.ro as unknown as { schedule: Array<{ type: string; value: number | null }> }).schedule;
    expect(sched.find((s) => s.type === "CHECKIN_TIME")?.value).toBe(1792253838454);
    expect(sched.find((s) => s.type === "CLOSED_TIME")?.value).toBe(1792275940076);
    expect(snap.ro.assignee?.advisor?.id).toBe("0657d9b2-1933-435a-bb51-54b05c2926be");
    expect(snap.source).toBe("internal");
  });

  it("maps vehicle incl. string year", () => {
    expect(snap.vehicle?.vin).toBe("1GCPSBEK0T1111077");
    expect(snap.vehicle?.year).toBe(2026);
    expect(snap.vehicle?.make).toBe("chevrolet");
    expect((snap.vehicle as { mileageIn?: number }).mileageIn).toBe(50387);
  });

  it("labor + parts are integer cents and match the OpenAPI payload op-for-op", () => {
    const flat = (p: any) =>
      p.jobs
        .flatMap((j: any) => j.operations.map((o: any) => ({ j, o })))
        .map(({ j, o }: any) => ({
          job: String(j.job.jobNumber),
          opcode: o.operation.opcode,
          payType: j.job.payType,
          sale: o.operation.labor.saleAmount,
          cost: o.operation.labor.costAmount,
          dur: o.operation.labor.billDuration,
          parts: o.parts
            .map((pt: any) => ({
              pn: pt.partNumber,
              sale: pt.saleAmount,
              cost: pt.costAmount,
              qty: pt.quantities.find((q: any) => q.type === "SALE")?.value,
            }))
            .sort((a: any, b: any) => String(a.pn).localeCompare(String(b.pn))),
        }))
        .sort((a: any, b: any) => a.job.localeCompare(b.job) || a.opcode.localeCompare(b.opcode));
    expect(flat(snap)).toEqual(flat(openapi));
  });

  it("buildFactsFromPayload is identical for both sources (except closeTs source)", () => {
    const a = buildFactsFromPayload(snap, emptyMap);
    const b = buildFactsFromPayload(openapi, emptyMap);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const strip = (f: any) => {
      const { ro, ops } = f;
      const { advisorName: _a, ...roRest } = ro;
      void _a;
      return { ro: roRest, ops, unclassified: f.unclassified };
    };
    expect(strip(a)).toEqual(strip(b));
  });

  it("tags carry every live opcode once", () => {
    const tags = (snap.ro.tags ?? []).filter((t) => t.field === "OPCODE").map((t) => t.value);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toContain("TEK7500BNM");
    expect(tags).not.toContain("GMLOF8"); // on a deleted job
  });
});

describe("partNumberOf / partCostCents", () => {
  it("strips the M_<BRAND>_ prefix for OEM parts", () => {
    expect(partNumberOf({ partId: "M_GM_19432357" })).toBe("19432357");
    expect(partNumberOf({ partId: "M_TMNA_0888681986" })).toBe("0888681986");
  });
  it("falls back to resolvedPartName head for non-OEM, dropping (S)", () => {
    expect(partNumberOf({ partId: "b96eda187e294f0fa3a07b0d076594f7", resolvedPartName: "BG9822 - CLASS ACT" })).toBe("BG9822");
    expect(partNumberOf({ partId: "zz", resolvedPartName: "19458926 (S) - FILTER" })).toBe("19458926");
  });
  it("prefers an explicit partNumber", () => {
    expect(partNumberOf({ partId: "M_GM_1", partNumber: "ABC" })).toBe("ABC");
  });
  it("nets OEM adjustment × qty out of cost", () => {
    expect(partCostCents({ totalCost: 1000, oemAdjustmentCostPerPart: 50, saleQty: 4 })).toBe(800);
    expect(partCostCents({ totalCost: 1000, saleQty: 4 })).toBe(1000);
  });
});

describe("groupJobsByRo", () => {
  it("groups by roId and ignores hits without one", () => {
    const m = groupJobsByRo([{ id: "a", roId: "r1" }, { id: "b", roId: "r1" }, { id: "c", roId: "r2" }, { id: "d" } as any]);
    expect([...m.keys()].sort()).toEqual(["r1", "r2"]);
    expect(m.get("r1")!.length).toBe(2);
  });
});

describe("parseInternalUser / persona", () => {
  const jacob = {
    id: "56ead8d2-097a-4a49-831a-ca4eeb0479a6",
    userNameDetails: { firstName: "JACOB", lastName: "DEBUSSEY", completeNames: [{ nameType: "DISPLAY_NAME", value: "JACOB DEBUSSEY" }] },
    userRoleDetails: {
      primaryRole: { persona: "EMPLOYEE", roleName: "Employee" },
      secondaryRoles: [{ persona: "SERVICE_ADVISOR", roleName: "ServiceAdvisor" }],
    },
  };
  it("secondary SERVICE_ADVISOR wins over a generic primary EMPLOYEE (T9 §7, BC Jacob Debussey)", () => {
    const u = parseInternalUser(jacob.id, jacob);
    expect(u.name).toBe("Jacob Debussey");
    expect(u.personas).toEqual(["EMPLOYEE", "SERVICE_ADVISOR"]);
    expect(u.persona).toBe("SERVICE_ADVISOR");
  });
  it("fixed-ops staff primaries keep precedence over a SERVICE_ADVISOR secondary (stay in Others)", () => {
    expect(effectivePersona(["SERVICE_DIRECTOR", "SERVICE_ADVISOR"])).toBe("SERVICE_DIRECTOR");
    expect(effectivePersona(["SERVICE_MANAGER", "SERVICE_ADVISOR"])).toBe("SERVICE_MANAGER");
    expect(effectivePersona(["WARRANTY_CLERK", "CASHIER", "SERVICE_ADVISOR"])).toBe("WARRANTY_CLERK");
    expect(effectivePersona(["TECHNICIAN", "SERVICE_ADVISOR"])).toBe("TECHNICIAN");
  });
  it("generic primaries are overridden by a SERVICE_ADVISOR secondary", () => {
    expect(effectivePersona(["EMPLOYEE", "SERVICE_ADVISOR"])).toBe("SERVICE_ADVISOR");
    expect(effectivePersona(["SALES_PERSON", "SERVICE_MANAGER", "SERVICE_ADVISOR"])).toBe("SERVICE_ADVISOR");
    expect(effectivePersona(["INVENTORY_MANAGER", "SERVICE_ADVISOR"])).toBe("SERVICE_ADVISOR");
    expect(effectivePersona(["SERVICE_MANAGER"])).toBe("SERVICE_MANAGER");
    expect(effectivePersona([])).toBeNull();
  });
  it("name falls back to first+last and title-cases ALL CAPS only", () => {
    const u = parseInternalUser("x", { userNameDetails: { firstName: "MARY-ANN", lastName: "O'NEIL" } });
    expect(u.name).toBe("Mary-Ann O'neil");
    expect(normalizeDisplayName("Juan Ramirez")).toBe("Juan Ramirez");
    expect(normalizeDisplayName("  ")).toBeNull();
  });
});
