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

/**
 * Cost in cents = totalCost as-is. Tekion's own pay-type cost totals
 * (paySplitTotalsV3.*.partCostAmount) are Σ partLine.totalCost with NO
 * oemAdjustmentCostPerPart netting (BC RO 105246: 31 lines Σ totalCost
 * 187185 == header partCostAmount 187185, lifter line adj 1584×16 NOT
 * subtracted). The earlier adj×qty subtraction under-stated W cost by $459
 * fleet-wide for Oct 1–22 2026.
 */
export function partCostCents(p: InternalPartLine): number {
  return Math.round(num(p.totalCost) ?? 0);
}

export function mapPart(p: InternalPartLine): Part {
  const qty = num(p.saleQty) ?? num(p.qty) ?? 0;
  // Sale INCLUDES the core charge: Tekion's own pay-type totals
  // (paySplitTotalsV3.*.partsAmount) are built from totalSaleWithCore
  // (BC RO 104817: totalSaleAmount 29995 + core 900 = partsAmount 30895).
  const withCore = num((p as { totalSaleWithCore?: unknown }).totalSaleWithCore);
  const sale = withCore ?? ((num(p.totalSaleAmount) ?? 0) + (num((p as { totalCoreAmount?: unknown }).totalCoreAmount) ?? 0));
  return {
    id: (p as { id?: unknown }).id as string | undefined,
    partNumber: partNumberOf(p),
    partName: str(p.resolvedPartName),
    status: str(p.status),
    saleAmount: Math.round(sale),
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
  const rawOps = (Array.isArray(j.operations) ? j.operations : [])
    .filter((o) => o && o.deleted !== true)
    .map((o) => ({ raw: o, ...mapOperation(o) }));
  const splits = paySplitsOf(j);
  const ops: Array<{ operation: Operation; parts: Part[] }> = splits
    ? rawOps.flatMap((o) => splitOperation(o.raw, o.operation, o.parts, splits, str(j.payType)))
    : rawOps.map(({ operation, parts }) => ({ operation, parts }));
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
    ...(splits ? { splitJob: true, splitPayTypes: splits.map((s) => s.payType) } : {}),
  };
  return { job, operations: ops };
}

// ---------------------------------------------------------------------------
// Split-pay jobs.
//
// A job carries ONE primary payType, but Tekion can split it across payers
// (job.splitInfo.splits[] — e.g. BST RO 156035 job 6: payType WARRANTY, 93.07%
// billed CUSTOMER_PAY). Tekion's own pay-type totals (header paySplitTotalsV3
// cp/wp/ipAmounts) allocate by that split; attributing the whole op to the
// primary payer mis-states CP vs W by the split amount (fleet Oct 1–22 2026:
// BST ±$9.4K, BC ±$5.3K, TOL ±$1.4K — totals tie, pay-type mix doesn't).
//
// Allocation uses splitInfo component rows:
//   LABOR  componentId = operation.id             → splitAmount (cents, exact)
//   PARTS  componentId = partLine.servicePartItemId → splitAmount (cents, exact)
//   OPERATION componentId = operation.id          → fallback % when no LABOR row
// Cost is scaled by the same share (splitAmount / amountToSplit). Billed hours
// stay on the primary payer — that is what Tekion does (cpAmounts.
// totalBillingTimeInSeconds excludes the split-in share).
// Each payer gets its own pseudo-operation (id "<opId>#<PAYTYPE>") with
// `splitPayType` set; facts read splitPayType ?? job.payType.
// ---------------------------------------------------------------------------

interface SplitComponent { component?: string; componentId?: string; splitPercentage?: number; splitAmount?: number; amountToSplit?: number }
interface PaySplit { payType: string; payerId: string | null; components: SplitComponent[] }

function paySplitsOf(j: InternalJob): PaySplit[] | null {
  const si = j.splitInfo as { splits?: unknown } | null | undefined;
  const raw = si && Array.isArray(si.splits) ? (si.splits as Array<Record<string, unknown>>) : [];
  const splits: PaySplit[] = raw
    .map((s) => ({
      payType: String(s.subPayType ?? s.payType ?? "").toUpperCase(),
      payerId: str(s.payerId),
      components: Array.isArray(s.components) ? (s.components as SplitComponent[]) : [],
    }))
    .filter((s) => s.payType);
  // Only a REAL split (≥2 payers) changes anything; single-payer splitInfo is the normal case.
  const distinct = new Set(splits.map((s) => s.payType));
  return distinct.size >= 2 ? splits : null;
}

/** Share (0..1) of a component for one payer: exact cents ratio when present, else percentage. */
function shareOf(c: SplitComponent | undefined): number | null {
  if (!c) return null;
  const amt = num(c.splitAmount), tot = num(c.amountToSplit);
  if (amt !== null && tot !== null && tot > 0) return Math.max(0, Math.min(1, amt / tot));
  const pct = num(c.splitPercentage);
  if (pct !== null) return Math.max(0, Math.min(1, pct / 100));
  return null;
}

function splitOperation(
  raw: InternalOperation,
  op: Operation,
  parts: Part[],
  splits: PaySplit[],
  primaryPayType: string | null,
): Array<{ operation: Operation; parts: Part[] }> {
  const primary = (primaryPayType ?? "").toUpperCase();
  const rawParts = (Array.isArray(raw.partLineV2s) ? raw.partLineV2s : []).filter((p) => p && p.deleted !== true);
  const laborSale = op.labor?.saleAmount ?? 0, laborCost = op.labor?.costAmount ?? 0;

  // Per-payer shares, with an "allocated so far" tracker so the last payer absorbs rounding.
  const out: Array<{ operation: Operation; parts: Part[] }> = [];
  let laborSaleLeft = laborSale, laborCostLeft = laborCost;
  const partSaleLeft = parts.map((p) => p.saleAmount ?? 0), partCostLeft = parts.map((p) => p.costAmount ?? 0);

  splits.forEach((sp, idx) => {
    const last = idx === splits.length - 1;
    const byId = (comp: string, id: string | null | undefined) => sp.components.find((c) => c.component === comp && id != null && String(c.componentId) === String(id));
    const opShare = shareOf(byId("LABOR", op.id)) ?? shareOf(byId("OPERATION", op.id)) ?? (sp.payType === primary ? 1 : 0);

    const lSale = last ? laborSaleLeft : Math.round(laborSale * opShare);
    const lCost = last ? laborCostLeft : Math.round(laborCost * opShare);
    laborSaleLeft -= lSale; laborCostLeft -= lCost;

    const spParts: Part[] = [];
    parts.forEach((p, pi) => {
      const rp = rawParts[pi];
      const key = rp ? (str(rp.servicePartItemId as unknown) ?? str(rp.partFulfilmentLineItemId as unknown) ?? str(rp.orderId as unknown)) : null;
      const pShare = shareOf(byId("PARTS", key)) ?? opShare;
      const pSale = last ? partSaleLeft[pi]! : Math.round((p.saleAmount ?? 0) * pShare);
      const pCost = last ? partCostLeft[pi]! : Math.round((p.costAmount ?? 0) * pShare);
      partSaleLeft[pi]! -= pSale; partCostLeft[pi]! -= pCost;
      if (pSale === 0 && pCost === 0 && sp.payType !== primary) return;
      spParts.push({ ...p, saleAmount: pSale, costAmount: pCost, ...(sp.payType !== primary ? { quantities: [{ type: "SALE", value: 0 }], splitShare: pShare } : { splitShare: pShare }) });
    });

    const isPrimary = sp.payType === primary;
    if (!isPrimary && lSale === 0 && lCost === 0 && spParts.length === 0) return;
    out.push({
      operation: {
        ...op,
        id: isPrimary ? op.id : `${op.id}#${sp.payType}`,
        payType: sp.payType,
        splitPayType: sp.payType,
        splitPayerId: sp.payerId,
        splitOf: op.id,
        labor: {
          ...op.labor,
          saleAmount: lSale,
          costAmount: lCost,
          // hours stay with the primary payer (matches Tekion paySplitTotalsV3.totalBillingTimeInSeconds)
          billDuration: isPrimary ? op.labor?.billDuration ?? 0 : 0,
          laborAllowanceDuration: isPrimary ? op.labor?.laborAllowanceDuration ?? null : null,
        },
      } as Operation,
      parts: spParts,
    });
  });
  // Safety: if the primary payer somehow wasn't in the split list, keep the original op whole.
  return out.length ? out : [{ operation: op, parts }];
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
