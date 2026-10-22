/**
 * Mapper: Tekion INTERNAL ro-search header + job/search hits  →  the EXACT
 * `RepairOrderSnapshot` shape the OpenAPI collector stores in
 * RawRepairOrder.payload. Facts (lib/facts/buildRoFacts.ts), the legacy
 * aggregator and every report read that shape, so nothing downstream changes
 * and the two sources can be tied out row-for-row (scripts/tieout-sources.ts).
 *
 * Money stays INTEGER CENTS. Verified against stored OpenAPI payloads
 * 2026-10-22: 12/12 ROs labor exact, 412/412 part lines sale+cost exact
 * (cost = totalCost − oemAdjustmentCostPerPart × saleQty).
 *
 * Pure functions — no I/O — so they are unit-testable with captured fixtures.
 */

import type { InternalJob, InternalOperation, InternalPartLine, InternalRoHeader } from "./client";
import type { Job, Operation, Part, RepairOrder, RepairOrderSnapshot, RoVehicle } from "../types";

export const INTERNAL_SOURCE_TAG = "internal" as const;

/** Snapshot plus a provenance tag so the Sync page can show which path wrote the row. */
export interface InternalSnapshot extends RepairOrderSnapshot {
  source: typeof INTERNAL_SOURCE_TAG;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function ms(v: unknown): number | null {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function amount(v: InternalOperation["laborAmount"]): number {
  if (v && typeof v === "object") return num((v as { amount?: unknown }).amount) ?? 0;
  return num(v) ?? 0;
}

/**
 * Part number from an internal part line.
 *   OEM:     partId "M_GM_19432357" / "M_TMNA_0888681986" → strip "M_<BRAND>_"
 *   non-OEM: partId is an opaque hex id → resolvedPartName "BG9822 - CLASS ACT" → "BG9822"
 *            ("19458926 (S) - FILTER" → "19458926"; "(S)" = superseded marker)
 */
export function partNumberOf(p: InternalPartLine): string | null {
  const explicit = str(p.partNumber);
  if (explicit) return explicit.trim();
  const pid = str(p.partId);
  if (pid) {
    const m = /^M_[A-Z0-9]+_(.+)$/.exec(pid);
    if (m) return m[1]!;
  }
  const rpn = str(p.resolvedPartName);
  if (rpn) {
    const head = rpn.split(" - ")[0]!.replace(/\s*\(S\)\s*$/i, "").trim();
    if (head) return head;
  }
  return null;
}

/** Cost in cents, net of OEM adjustment (OpenAPI reports the post-adjustment cost). */
export function partCostCents(p: InternalPartLine): number {
  const total = num(p.totalCost) ?? 0;
  const adj = num(p.oemAdjustmentCostPerPart) ?? 0;
  const qty = num(p.saleQty) ?? num(p.qty) ?? 0;
  return Math.round(total - adj * qty);
}

export function mapPart(p: InternalPartLine): Part {
  const qty = num(p.saleQty) ?? num(p.qty) ?? 0;
  return {
    id: (p as { id?: unknown }).id as string | undefined,
    partNumber: partNumberOf(p),
    partName: str(p.resolvedPartName),
    status: str(p.status),
    saleAmount: Math.round(num(p.totalSaleAmount) ?? 0),
    costAmount: partCostCents(p),
    quantities: [{ type: "SALE", value: qty }],
    creationTime: ms(p.createdTime),
    modifiedTime: ms(p.modifiedTime),
  };
}

export function mapOperation(o: InternalOperation): { operation: Operation; parts: Part[] } {
  const parts = (Array.isArray(o.partLineV2s) ? o.partLineV2s : [])
    .filter((p) => p && p.deleted !== true)
    .map(mapPart);
  const operation: Operation = {
    id: o.id,
    opcode: str(o.opcode),
    opcodeDescription: str(o.opcodeDescription),
    operationNumber: str(o.operationNumber),
    payType: str(o.payType),
    labor: {
      saleAmount: Math.round(amount(o.laborAmount)),
      costAmount: Math.round(amount(o.laborCostAmount)),
      billDuration: Math.round(num(o.billingTimeInSeconds) ?? 0),
      laborAllowanceDuration: num(o.laborTimeInSeconds),
    },
    opcodeType: str(o.opcodeType),
    category: str(o.category),
    creationTime: ms(o.createdTime),
    modifiedTime: ms(o.modifiedTime),
  };
  return { operation, parts };
}

export function mapJob(j: InternalJob): { job: Job; operations: Array<{ operation: Operation; parts: Part[] }> } {
  const ops = (Array.isArray(j.operations) ? j.operations : [])
    .filter((o) => o && o.deleted !== true)
    .map(mapOperation);
  const job: Job = {
    id: j.id,
    jobNumber: j.jobNumber != null ? String(j.jobNumber) : null,
    status: str(j.status),
    payType: str(j.payType),
    subPayType: str(j.subPayType),
    type: str(j.type),
    concern: str((j.concern as unknown) as string) ?? str((j.concern as { text?: string } | null)?.text),
    creationTime: ms(j.createdTime),
    modifiedTime: ms(j.modifiedTime),
    completionTime: ms(j.completedTime),
  };
  return { job, operations: ops };
}

function schedule(h: InternalRoHeader): Array<{ type: string; value: number | null }> {
  return [
    { type: "APPOINTMENT_TIME", value: ms(h.appointmentDateTime) },
    { type: "INVOICED_TIME", value: ms(h.lastInvoicedTime) },
    { type: "CHECKIN_TIME", value: ms(h.checkinTime) },
    { type: "CLOSED_TIME", value: ms(h.closedTime) ?? ms(h.firstClosedTime) },
    { type: "PROMISE_TIME", value: ms(h.promiseTime) },
  ];
}

export function mapVehicle(h: InternalRoHeader): RoVehicle | null {
  const v = h.vehicle;
  if (!v || typeof v !== "object") return null;
  const vin = str(v.vin);
  if (!vin && !str(v.make) && !str(v.model)) return null;
  return {
    vin,
    year: num(v.year),
    make: str(v.make) ?? str(v.makeLabel),
    model: str(v.model) ?? str(v.displayModel),
    mileageIn: num(v.mileageIn),
    mileageOut: num(v.mileageOut),
    mileage: num(v.mileageIn) ?? num(v.mileageOut),
    oem: str(v.oem),
    brand: str(v.brand),
  } as RoVehicle;
}

/**
 * Build the snapshot. `jobs` must be the job/search hits for THIS ro id
 * (caller groups by roId). Deleted jobs == voided; dropped here so
 * nonVoidedJobCount ties and facts never see them.
 */
export function mapInternalRo(h: InternalRoHeader, jobs: InternalJob[]): InternalSnapshot {
  const liveJobs = jobs.filter((j) => j && j.deleted !== true);
  const mappedJobs = liveJobs
    .slice()
    .sort((a, b) => (num(a.jobNumber) ?? 0) - (num(b.jobNumber) ?? 0))
    .map(mapJob);

  const tags: Array<{ field: string; value: string }> = [];
  const seenOp = new Set<string>();
  for (const mj of mappedJobs) {
    for (const { operation } of mj.operations) {
      const oc = operation.opcode;
      if (oc && !seenOp.has(oc)) {
        seenOp.add(oc);
        tags.push({ field: "OPCODE", value: oc });
      }
    }
  }

  const advisorId = str(h.primaryAdvisorId);
  const closed = ms(h.closedTime) ?? ms(h.firstClosedTime);
  const ro: RepairOrder = {
    documentId: h.id,
    documentNumber: str(h.roNo),
    status: str(h.status),
    type: str(h.type),
    creationTime: ms(h.createdTime),
    modifiedTime: ms(h.modifiedTime),
    closedTime: closed,
    invoicedTime: ms(h.lastInvoicedTime),
    assignee: {
      advisor: advisorId ? { id: advisorId, link: `/users/${advisorId}` } : null,
    },
    vehicle: mapVehicle(h) as RepairOrder["vehicle"],
    tags,
    // extra header facts kept for reports (not read by facts today)
    schedule: schedule(h),
    source: str(h.source),
    departmentId: str(h.departmentId),
    jobCount: num(h.jobCount),
    nonVoidedJobCount: num(h.nonVoidedJobCount),
  } as RepairOrder;

  return {
    ro,
    vehicle: mapVehicle(h),
    jobs: mappedJobs,
    advisorName: null,
    advisorPersona: null,
    source: INTERNAL_SOURCE_TAG,
  };
}

/** Group job/search hits by roId. */
export function groupJobsByRo(hits: InternalJob[]): Map<string, InternalJob[]> {
  const m = new Map<string, InternalJob[]>();
  for (const h of hits) {
    if (!h?.roId) continue;
    const arr = m.get(h.roId);
    if (arr) arr.push(h);
    else m.set(h.roId, [h]);
  }
  return m;
}
