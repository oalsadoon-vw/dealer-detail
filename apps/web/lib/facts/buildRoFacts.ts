import "server-only";

/**
 * RawRepairOrder.payload → RoFact + RoOpFact fact builder (v2 reporting layer).
 *
 * One RoFact per RO, one RoOpFact per operation. Money in DOLLARS, business
 * dates in the STORE's local timezone (default America/Los_Angeles) stored as
 * midnight-UTC date-only values. Idempotent: delete+insert per RO.
 *
 * Date semantics (the Kim/SCVW tie-out):
 *   openDate  = CHECKIN_TIME (schedule) else ro.creationTime     → "Opened" views
 *   closeDate = CLOSED_TIME (schedule) else INVOICED_TIME else
 *               (modifiedTime if status is terminal)             → "Closed" views
 *
 * Classification per operation:
 *   isMenu   = strict factory SERVICE_MENU opcode (TEK<mileage>[BPV][NS]M) OR a
 *              store/global OpcodeCategory row mapped to MENU.
 *   category = MENU | ALA | COMMODITY | REC | OTHER
 *   payClass = CP | W | I | O from job.payType.
 */

import { prisma } from "@/lib/db";
import {
  classifyOpcode,
  loadOpcodeCategories,
  normalizeOpcode,
  type OpcodeMap,
} from "@/lib/aggregate/opcodeClassifier";

const DEFAULT_TZ = "America/Los_Angeles";
const TERMINAL_STATUSES = new Set(["CLOSED", "INVOICED", "VOIDED", "VOID", "CANCELLED"]);

// ---------- date helpers ----------

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Epoch ms → local calendar date in tz → Date at midnight UTC (date-only). */
export function localBusinessDate(ms: number, tz: string = DEFAULT_TZ): Date {
  const ymd = dtf(tz).format(new Date(ms)); // "YYYY-MM-DD"
  return new Date(`${ymd}T00:00:00.000Z`);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function cents(v: unknown): number {
  return num(v) ?? 0;
}
function dollars(c: number): number {
  return Math.round(c) / 100;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function scheduleValue(ro: any, type: string): number | null {
  const sched: any[] = Array.isArray(ro?.schedule) ? ro.schedule : [];
  const hit = sched.find((s) => s?.type === type);
  return num(hit?.value);
}

export function payClassOf(payType: unknown): "CP" | "W" | "I" | "O" {
  const p = String(payType ?? "").toUpperCase();
  if (!p) return "O";
  if (p.startsWith("CUSTOMER") || p === "CP" || p === "RETAIL") return "CP";
  if (p.startsWith("WARRANTY") || p === "W" || p === "EXTENDED_WARRANTY") return "W";
  if (p.startsWith("INTERNAL") || p === "I") return "I";
  return "O";
}

// ---------- payload walk ----------

export interface BuiltFacts {
  ro: {
    documentId: string;
    documentNumber: string;
    status: string | null;
    roType: string | null;
    advisorTekionId: string | null;
    advisorName: string | null;
    openDate: Date;
    closeDate: Date | null;
    openTs: Date;
    closeTs: Date | null;
    isClosed: boolean;
    vin: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    mileage: number | null;
    jobCount: number;
    opCount: number;
    laborSale: number;
    laborCost: number;
    partsSale: number;
    partsCost: number;
    billHours: number;
    cpLaborSale: number; cpPartsSale: number; cpBillHours: number;
    wLaborSale: number;  wPartsSale: number;  wBillHours: number;
    iLaborSale: number;  iPartsSale: number;  iBillHours: number;
    oLaborSale: number;  oPartsSale: number;  oBillHours: number;
    hasMenu: boolean;
    menuLines: number;
    menuLaborSale: number;
    menuPartsSale: number;
    hasAla: boolean;
    isCpRo: boolean;
  };
  ops: Array<{
    jobNumber: string | null;
    jobStatus: string | null;
    payType: string | null;
    subPayType: string | null;
    payClass: "CP" | "W" | "I" | "O";
    opcode: string;
    opcodeDesc: string | null;
    category: string;
    commodityKey: string | null;
    isMenu: boolean;
    laborSale: number;
    laborCost: number;
    billHours: number;
    partsSale: number;
    partsCost: number;
    partsQty: number;
  }>;
  unclassified: string[];
}

export function buildFactsFromPayload(
  payload: any,
  opcodeMap: OpcodeMap,
  tz: string = DEFAULT_TZ,
): BuiltFacts | null {
  const ro = payload?.ro;
  if (!ro?.documentId) return null;

  const creation = num(ro.creationTime);
  const checkin = scheduleValue(ro, "CHECKIN_TIME");
  const openMs = checkin ?? creation;
  if (openMs === null) return null;

  const status: string | null = ro.status ?? null;
  const terminal = status ? TERMINAL_STATUSES.has(String(status).toUpperCase()) : false;
  const closedSched = scheduleValue(ro, "CLOSED_TIME");
  const invoicedSched = scheduleValue(ro, "INVOICED_TIME") ?? num(ro.invoicedTime);
  const closeMs =
    closedSched ??
    num(ro.closedTime) ??
    (terminal ? (invoicedSched ?? num(ro.modifiedTime)) : null);
  const isClosed = terminal && closeMs !== null;

  const veh = payload?.vehicle ?? {};
  const mileage = num(veh.mileageIn) ?? num(veh.mileage) ?? num(veh.mileageOut);

  const ops: BuiltFacts["ops"] = [];
  const unclassified = new Set<string>();
  const r = {
    laborSale: 0, laborCost: 0, partsSale: 0, partsCost: 0, billHours: 0,
    cpLaborSale: 0, cpPartsSale: 0, cpBillHours: 0,
    wLaborSale: 0, wPartsSale: 0, wBillHours: 0,
    iLaborSale: 0, iPartsSale: 0, iBillHours: 0,
    oLaborSale: 0, oPartsSale: 0, oBillHours: 0,
    menuLines: 0, menuLaborSale: 0, menuPartsSale: 0, hasAla: false,
  };

  const jobs: any[] = Array.isArray(payload?.jobs) ? payload.jobs : [];
  for (const j of jobs) {
    const job = j?.job ?? j ?? {};
    const jStatus = String(job.status ?? "").toUpperCase();
    if (jStatus === "VOIDED" || jStatus === "VOID" || jStatus === "DELETED") continue;
    const payType: string | null = job.payType ?? null;
    const payClass = payClassOf(payType);
    const opsRaw: any[] = Array.isArray(j?.operations)
      ? j.operations
      : Array.isArray(job?.operations) ? job.operations : [];

    for (const o of opsRaw) {
      const op = o?.operation ?? o ?? {};
      const parts: any[] = Array.isArray(o?.parts) ? o.parts : Array.isArray(op?.parts) ? op.parts : [];
      const opcode = normalizeOpcode(op.opcode ?? job.opcode ?? null);

      const laborSale = dollars(cents(op?.labor?.saleAmount));
      const laborCost = dollars(cents(op?.labor?.costAmount));
      const billHours = round2(cents(op?.labor?.billDuration) / 3600); // seconds → hours

      let partsSale = 0, partsCost = 0, partsQty = 0;
      for (const p of parts) {
        const pStatus = String(p?.status ?? "").toUpperCase();
        if (pStatus === "VOIDED" || pStatus === "CANCELLED" || pStatus === "REMOVED") continue;
        partsSale += dollars(cents(p?.saleAmount));
        partsCost += dollars(cents(p?.costAmount));
        const q = Array.isArray(p?.quantities)
          ? num(p.quantities.find((x: any) => x?.type === "SALE")?.value)
          : num(p?.quantity);
        partsQty += q ?? 0;
      }
      partsSale = round2(partsSale); partsCost = round2(partsCost);

      const mapping = opcode ? classifyOpcode(opcodeMap, opcode) : null;
      const category = mapping?.category ?? "OTHER";
      if (!mapping && opcode) unclassified.add(opcode);
      const isMenu = category === "MENU";

      ops.push({
        jobNumber: job.jobNumber != null ? String(job.jobNumber) : null,
        jobStatus: job.status ?? null,
        payType,
        subPayType: job.subPayType ?? null,
        payClass,
        opcode: opcode || "(none)",
        opcodeDesc: op.opcodeDescription ?? null,
        category,
        commodityKey: mapping?.commodityKey ?? null,
        isMenu,
        laborSale, laborCost, billHours, partsSale, partsCost, partsQty,
      });

      r.laborSale += laborSale; r.laborCost += laborCost;
      r.partsSale += partsSale; r.partsCost += partsCost;
      r.billHours += billHours;
      if (payClass === "CP") { r.cpLaborSale += laborSale; r.cpPartsSale += partsSale; r.cpBillHours += billHours; }
      else if (payClass === "W") { r.wLaborSale += laborSale; r.wPartsSale += partsSale; r.wBillHours += billHours; }
      else if (payClass === "I") { r.iLaborSale += laborSale; r.iPartsSale += partsSale; r.iBillHours += billHours; }
      else { r.oLaborSale += laborSale; r.oPartsSale += partsSale; r.oBillHours += billHours; }
      if (isMenu) { r.menuLines++; r.menuLaborSale += laborSale; r.menuPartsSale += partsSale; }
      if (category === "ALA") r.hasAla = true;
    }
  }

  const rr = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? round2(v) : v])) as typeof r;

  return {
    ro: {
      documentId: String(ro.documentId),
      documentNumber: String(ro.documentNumber ?? ro.documentId),
      status,
      roType: ro.type ?? null,
      advisorTekionId: ro?.assignee?.advisor?.id ?? null,
      advisorName: payload?.advisorName ?? null,
      openDate: localBusinessDate(openMs, tz),
      closeDate: closeMs !== null ? localBusinessDate(closeMs, tz) : null,
      openTs: new Date(openMs),
      closeTs: closeMs !== null ? new Date(closeMs) : null,
      isClosed,
      vin: veh.vin ?? null,
      year: num(veh.year),
      make: veh.make ?? null,
      model: veh.model ?? null,
      mileage,
      jobCount: jobs.length,
      opCount: ops.length,
      ...rr,
      hasMenu: rr.menuLines > 0,
      isCpRo: rr.cpLaborSale + rr.cpPartsSale > 0,
    },
    ops,
    unclassified: Array.from(unclassified),
  };
}

// ---------- persistence ----------

function nameToNormalized(name: string | null | undefined) {
  if (!name || !name.trim()) return { nameNormalized: "UNASSIGNED", nameRaw: null as string | null };
  const t = name.trim().replace(/\s+/g, " ");
  return { nameNormalized: t.toUpperCase(), nameRaw: t };
}

async function advisorIdFor(
  storeId: string,
  name: string | null,
  tekionUserId: string | null,
  cache: Map<string, string>,
): Promise<string> {
  const { nameNormalized, nameRaw } = nameToNormalized(name);
  const key = `${storeId}::${nameNormalized}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const adv = await prisma.advisor.upsert({
    where: { storeId_nameNormalized: { storeId, nameNormalized } },
    create: { storeId, nameNormalized, nameRaw: nameRaw ?? nameNormalized, tekionUserId },
    update: tekionUserId ? { tekionUserId } : {},
    select: { id: true },
  });
  cache.set(key, adv.id);
  return adv.id;
}

export interface BuildRoFactsParams {
  storeId: string;
  /** Only rebuild these documentIds (default: every raw RO for the store). */
  documentIds?: string[];
  /** Only rebuild raw rows fetched at/after this instant. */
  fetchedSince?: Date;
  batchSize?: number;
  log?: (msg: string) => void;
}

export interface BuildRoFactsResult {
  rosBuilt: number;
  opsBuilt: number;
  skipped: number;
  unclassifiedOpcodes: string[];
  touchedOpenDates: Date[];
  touchedCloseDates: Date[];
}

/**
 * Rebuild fact rows for a store. Safe to call repeatedly; each RO is replaced
 * atomically (delete ops+fact, insert fresh) inside one transaction per batch.
 */
export async function buildRoFacts(params: BuildRoFactsParams): Promise<BuildRoFactsResult> {
  const { storeId } = params;
  const batchSize = params.batchSize ?? 200;
  const log = params.log ?? (() => {});

  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { timezone: true, abbreviation: true },
  });
  const tz = store.timezone || DEFAULT_TZ;
  const opcodeMap = await loadOpcodeCategories(storeId);
  const advisorCache = new Map<string, string>();
  const unclassified = new Set<string>();
  const openDates = new Map<number, Date>();
  const closeDates = new Map<number, Date>();
  let rosBuilt = 0, opsBuilt = 0, skipped = 0;

  const where: any = { storeId };
  if (params.documentIds?.length) where.documentId = { in: params.documentIds };
  if (params.fetchedSince) where.fetchedAt = { gte: params.fetchedSince };

  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.rawRepairOrder.findMany({
      where,
      select: { id: true, documentId: true, payload: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    const built: Array<{ f: BuiltFacts; advisorId: string }> = [];
    for (const row of rows) {
      const f = buildFactsFromPayload(row.payload, opcodeMap, tz);
      if (!f) { skipped++; continue; }
      const advisorId = await advisorIdFor(storeId, f.ro.advisorName, f.ro.advisorTekionId, advisorCache);
      built.push({ f, advisorId });
      for (const u of f.unclassified) unclassified.add(u);
      openDates.set(f.ro.openDate.getTime(), f.ro.openDate);
      if (f.ro.closeDate) closeDates.set(f.ro.closeDate.getTime(), f.ro.closeDate);
    }
    if (built.length === 0) continue;

    const docIds = built.map((b) => b.f.ro.documentId);
    await prisma.$transaction(async (tx) => {
      // Capture old close/open dates so callers can re-aggregate moved ROs.
      const old = await tx.roFact.findMany({
        where: { storeId, documentId: { in: docIds } },
        select: { openDate: true, closeDate: true },
      });
      for (const o of old) {
        openDates.set(o.openDate.getTime(), o.openDate);
        if (o.closeDate) closeDates.set(o.closeDate.getTime(), o.closeDate);
      }
      await tx.roFact.deleteMany({ where: { storeId, documentId: { in: docIds } } }); // cascades ops

      const factRows = built.map(({ f, advisorId }) => {
        const { advisorName: _n, ...rest } = f.ro; void _n;
        return { ...rest, storeId, advisorId };
      });
      const createdFacts = await tx.roFact.createManyAndReturn({
        data: factRows,
        select: { id: true, documentId: true },
      });
      const factIdByDoc = new Map(createdFacts.map((c) => [c.documentId, c.id]));

      const opRows = built.flatMap(({ f, advisorId }) =>
        f.ops.map((op) => ({
          ...op,
          storeId,
          roFactId: factIdByDoc.get(f.ro.documentId)!,
          documentId: f.ro.documentId,
          documentNumber: f.ro.documentNumber,
          advisorId,
          openDate: f.ro.openDate,
          closeDate: f.ro.closeDate,
        })),
      );
      if (opRows.length) await tx.roOpFact.createMany({ data: opRows });
      rosBuilt += built.length;
      opsBuilt += opRows.length;
    }, { timeout: 120_000 });

    log(`${store.abbreviation ?? storeId} facts: ${rosBuilt} ROs / ${opsBuilt} ops so far`);
    if (rows.length < batchSize) break;
  }

  return {
    rosBuilt,
    opsBuilt,
    skipped,
    unclassifiedOpcodes: Array.from(unclassified).sort(),
    touchedOpenDates: Array.from(openDates.values()),
    touchedCloseDates: Array.from(closeDates.values()),
  };
}
