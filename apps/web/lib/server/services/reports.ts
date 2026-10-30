import "server-only";

/**
 * v2 reporting service — every number the dashboard shows comes from here,
 * read off RoFact / RoOpFact (never from raw payload JSON at request time).
 *
 * Date semantics are EXPLICIT on every query:
 *   basis = "opened"   → bucket by RoFact.openDate       (Tekion RO list by
 *                        created date)
 *   basis = "closed"   → bucket by RoFact.firstCloseDate (original close — a
 *                        re-closed RO stays in the month it first posted in;
 *                        matches Sean's Advisor Performance + the FS month)
 *   basis = "activity" → opened in range OR first-closed in range — "everything
 *                        that touched the shop this period", deduped per RO.
 *
 * Filter semantics (D1/D4/D6): statuses[] defaults to every canonical Tekion
 * status except VOIDED; payClasses[] (CP/W/I/O) defaults to all four. A pay
 * filter that isn't "all 4" makes RO-level money come from RoOpFact (RoFact
 * pre-sums are all-pay) and RO counts mean "ROs with ≥1 matching op".
 *
 * All money is dollars. Gross = sale − cost (labor + parts) off RO lines;
 * this is "RO gross", NOT the GL/financial-statement gross (see glService).
 */

import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/server/tenant-context";
import { requireStoreAccess } from "@/lib/server/authz";

export type DateBasis = "activity" | "opened" | "closed";

/** Canonical Tekion RO statuses (as returned by the internal collector). */
export const CANONICAL_STATUSES = [
  "CLOSED", "INVOICED", "READY_FOR_INVOICE", "IN_PROGRESS", "TECH_ASSIGNED",
  "PARTIALLY_ASSIGNED", "UNASSIGNED", "HOLD", "VOIDED",
] as const;
/** The six non-terminal statuses that make up the "Open" chip group (D4). */
export const OPEN_STATUSES = [
  "READY_FOR_INVOICE", "IN_PROGRESS", "TECH_ASSIGNED", "PARTIALLY_ASSIGNED",
  "UNASSIGNED", "HOLD",
] as const;
/** Default selection = everything except VOIDED (D6). */
export const DEFAULT_STATUSES: string[] = CANONICAL_STATUSES.filter((s) => s !== "VOIDED");

export type PayClass = "CP" | "W" | "I" | "O";
export const ALL_PAY_CLASSES: PayClass[] = ["CP", "W", "I", "O"];
export const PAY_CLASS_LABEL: Record<PayClass, string> = {
  CP: "Customer Pay", W: "Warranty", I: "Internal", O: "Other / Service Plans",
};

/** Expand the OPEN alias + apply the default. Always returns canonical statuses. */
export function resolveStatuses(statuses?: readonly string[] | null): string[] {
  if (!statuses || statuses.length === 0) return [...DEFAULT_STATUSES];
  const out = new Set<string>();
  for (const raw of statuses) {
    const s = raw.trim().toUpperCase();
    if (!s) continue;
    if (s === "OPEN") { for (const o of OPEN_STATUSES) out.add(o); }
    else out.add(s);
  }
  return out.size ? Array.from(out) : [...DEFAULT_STATUSES];
}

export function resolvePayClasses(payClasses?: readonly PayClass[] | null): PayClass[] {
  if (!payClasses || payClasses.length === 0) return [...ALL_PAY_CLASSES];
  const out: PayClass[] = [];
  for (const p of payClasses) {
    const u = p.toUpperCase() as PayClass;
    if (ALL_PAY_CLASSES.includes(u) && !out.includes(u)) out.push(u);
  }
  return out.length ? out : [...ALL_PAY_CLASSES];
}

/** True when a pay filter narrows below all 4 — RO money must come from RoOpFact. */
export function payFilterActive(payClasses?: readonly PayClass[] | null): boolean {
  const pc = resolvePayClasses(payClasses);
  return pc.length !== ALL_PAY_CLASSES.length;
}

export interface ReportRange {
  storeId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
  basis: DateBasis;
  /** Canonical Tekion statuses (OPEN alias resolved by the route/report helpers). */
  statuses?: string[];
  /** CP | W | I | O */
  payClasses?: PayClass[];
}

function ymdToUtc(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
function utcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
function div(a: number, b: number): number {
  return b ? r2(a / b) : 0;
}

/**
 * Shared RO filter for every report.
 *   opened   basis → openDate in range, status in selection
 *   closed   basis → firstCloseDate in range, status in selection (no more hard
 *                    CLOSED — the status strip decides; D2/D4)
 *   activity basis → (openDate in range OR firstCloseDate in range), status in
 *                    selection — an RO matches at most one RoFact row, so the
 *                    "dedup per RO" of D2 is the row identity itself.
 */
function dateWhere(range: ReportRange) {
  const gte = ymdToUtc(range.startDate);
  const lte = ymdToUtc(range.endDate);
  const statusIn = { status: { in: resolveStatuses(range.statuses) } };
  if (range.basis === "opened") return { openDate: { gte, lte }, ...statusIn };
  if (range.basis === "activity") {
    return { OR: [{ openDate: { gte, lte } }, { firstCloseDate: { gte, lte } }], ...statusIn };
  }
  return { firstCloseDate: { gte, lte }, ...statusIn };
}
/** Same filter expressed through RoOpFact's denormalized columns (no join). */
function opDateWhere(range: ReportRange) {
  const gte = ymdToUtc(range.startDate);
  const lte = ymdToUtc(range.endDate);
  const statusIn = { roStatus: { in: resolveStatuses(range.statuses) } };
  const payIn = { payClass: { in: resolvePayClasses(range.payClasses) } };
  if (range.basis === "opened") return { openDate: { gte, lte }, ...statusIn, ...payIn };
  if (range.basis === "activity") {
    return { OR: [{ openDate: { gte, lte } }, { firstCloseDate: { gte, lte } }], ...statusIn, ...payIn };
  }
  return { firstCloseDate: { gte, lte }, ...statusIn, ...payIn };
}
/** Date column for ordering / closed+opened daily series (activity handled separately). */
const dateCol = (b: DateBasis): "openDate" | "firstCloseDate" => (b === "opened" ? "openDate" : "firstCloseDate");

// ---------------------------------------------------------------------------
// Pay-type breakdown (sale, cost, gross — labor and parts) off RoOpFact.
//
// RoFact only carries per-pay-type SALE (cpLaborSale …); COST lives per
// operation, so gross-by-pay-type has to be summed off RoOpFact.payClass.
// This is the view that reconciles the site to the old "Parts & Labor Gross"
// Google sheet (which was Customer-Pay gross only) and to Tekion's
// paySplitTotalsV3 (cp/wp/ip amounts). Verified 2026-10-23 Oct 1–22 fleet:
// site total gross ties to Tekion within 0.2% every store (TOL/VWC exact).
// ---------------------------------------------------------------------------

export interface PayTypeGross {
  payClass: PayClass;
  label: string;
  lines: number;
  laborSale: number; laborCost: number; laborGross: number;
  partsSale: number; partsCost: number; partsGross: number;
  totalSale: number; totalCost: number; totalGross: number;
  billHours: number;
  elr: number;
}

function emptyPayType(pc: PayClass): PayTypeGross {
  return {
    payClass: pc, label: PAY_CLASS_LABEL[pc], lines: 0,
    laborSale: 0, laborCost: 0, laborGross: 0,
    partsSale: 0, partsCost: 0, partsGross: 0,
    totalSale: 0, totalCost: 0, totalGross: 0,
    billHours: 0, elr: 0,
  };
}

function payTypeFromAgg(pc: PayClass, count: number, s: any): PayTypeGross {
  const ls = s?.laborSale ?? 0, lc = s?.laborCost ?? 0, ps = s?.partsSale ?? 0, pcst = s?.partsCost ?? 0, hrs = s?.billHours ?? 0;
  return {
    payClass: pc, label: PAY_CLASS_LABEL[pc], lines: count,
    laborSale: r2(ls), laborCost: r2(lc), laborGross: r2(ls - lc),
    partsSale: r2(ps), partsCost: r2(pcst), partsGross: r2(ps - pcst),
    totalSale: r2(ls + ps), totalCost: r2(lc + pcst), totalGross: r2(ls - lc + ps - pcst),
    billHours: r2(hrs), elr: div(ls, hrs),
  };
}

const PAY_ORDER: PayClass[] = ["CP", "W", "I", "O"];

/** Store-level pay-type breakdown for the range. Always returns all 4 classes (zeros if absent). */
async function getPayTypeBreakdown(range: ReportRange): Promise<PayTypeGross[]> {
  const where = { storeId: range.storeId, ...opDateWhere(range) };
  const g = await prisma.roOpFact.groupBy({
    by: ["payClass"], where, _count: true,
    _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true },
  });
  const m = new Map(g.map((r) => [r.payClass as PayClass, r]));
  return PAY_ORDER.map((pc) => {
    const r = m.get(pc);
    return r ? payTypeFromAgg(pc, r._count, r._sum) : emptyPayType(pc);
  });
}

/** Per-advisor pay-type breakdown: advisorId → { CP, W, I, O }. */
async function getPayTypeBreakdownByAdvisor(range: ReportRange): Promise<Map<string, Record<PayClass, PayTypeGross>>> {
  const where = { storeId: range.storeId, ...opDateWhere(range) };
  const g = await prisma.roOpFact.groupBy({
    by: ["advisorId", "payClass"], where, _count: true,
    _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true },
  });
  const out = new Map<string, Record<PayClass, PayTypeGross>>();
  for (const r of g) {
    const id = r.advisorId ?? "";
    if (!out.has(id)) out.set(id, { CP: emptyPayType("CP"), W: emptyPayType("W"), I: emptyPayType("I"), O: emptyPayType("O") });
    const pc = (PAY_ORDER.includes(r.payClass as PayClass) ? r.payClass : "O") as PayClass;
    out.get(id)![pc] = payTypeFromAgg(pc, r._count, r._sum);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Summary + daily series
// ---------------------------------------------------------------------------

export interface SummaryTotals {
  roCount: number;
  closedCount: number;
  openCount: number;
  cpRoCount: number;
  laborSale: number;
  laborCost: number;
  laborGross: number;
  partsSale: number;
  partsCost: number;
  partsGross: number;
  totalSale: number;
  totalGross: number;
  billHours: number;
  elr: number;            // laborSale / billHours
  hoursPerRo: number;
  salePerRo: number;
  menuRos: number;
  menuPenetration: number; // menuRos / roCount
  cp: { laborSale: number; partsSale: number; billHours: number };
  warranty: { laborSale: number; partsSale: number; billHours: number };
  internal: { laborSale: number; partsSale: number; billHours: number };
  other: { laborSale: number; partsSale: number; billHours: number };
  /** Sale / cost / gross by pay type (labor + parts), off RO operations. Sums to the store totals. */
  byPayType: PayTypeGross[];
}

export interface DailyPoint {
  date: string;
  roCount: number;
  laborSale: number;
  partsSale: number;
  laborGross: number;
  partsGross: number;
  billHours: number;
  menuRos: number;
}

function totalsFromAgg(a: any, counts: { ro: number; closed: number; cp: number; menu: number }, byPayType: PayTypeGross[]): SummaryTotals {
  const s = a._sum ?? {};
  const laborSale = s.laborSale ?? 0, laborCost = s.laborCost ?? 0;
  const partsSale = s.partsSale ?? 0, partsCost = s.partsCost ?? 0;
  const billHours = s.billHours ?? 0;
  return {
    roCount: counts.ro,
    closedCount: counts.closed,
    openCount: counts.ro - counts.closed,
    cpRoCount: counts.cp,
    laborSale: r2(laborSale), laborCost: r2(laborCost), laborGross: r2(laborSale - laborCost),
    partsSale: r2(partsSale), partsCost: r2(partsCost), partsGross: r2(partsSale - partsCost),
    totalSale: r2(laborSale + partsSale),
    totalGross: r2(laborSale - laborCost + partsSale - partsCost),
    billHours: r2(billHours),
    elr: div(laborSale, billHours),
    hoursPerRo: div(billHours, counts.ro),
    salePerRo: div(laborSale + partsSale, counts.ro),
    menuRos: counts.menu,
    menuPenetration: counts.ro ? r2((counts.menu / counts.ro) * 100) : 0,
    cp: { laborSale: r2(s.cpLaborSale ?? 0), partsSale: r2(s.cpPartsSale ?? 0), billHours: r2(s.cpBillHours ?? 0) },
    warranty: { laborSale: r2(s.wLaborSale ?? 0), partsSale: r2(s.wPartsSale ?? 0), billHours: r2(s.wBillHours ?? 0) },
    internal: { laborSale: r2(s.iLaborSale ?? 0), partsSale: r2(s.iPartsSale ?? 0), billHours: r2(s.iBillHours ?? 0) },
    other: { laborSale: r2(s.oLaborSale ?? 0), partsSale: r2(s.oPartsSale ?? 0), billHours: r2(s.oBillHours ?? 0) },
    byPayType,
  };
}

const SUM_FIELDS = {
  laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true,
  cpLaborSale: true, cpPartsSale: true, cpBillHours: true,
  wLaborSale: true, wPartsSale: true, wBillHours: true,
  iLaborSale: true, iPartsSale: true, iBillHours: true,
  oLaborSale: true, oPartsSale: true, oBillHours: true,
} as const;

const OP_MONEY_SUM = { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true } as const;

interface DailyBucket { count: number; laborSale: number; laborCost: number; partsSale: number; partsCost: number; billHours: number; }
const emptyBucket = (): DailyBucket => ({ count: 0, laborSale: 0, laborCost: 0, partsSale: 0, partsCost: 0, billHours: 0 });

/**
 * Distinct documentIds of ops that match the range under the active pay filter
 * (D5: an RO contributes when it has ≥1 matching op). Null when no pay filter.
 * Only call when payFilterActive(range).
 */
async function matchingDocIds(storeId: string, range: ReportRange): Promise<string[]> {
  const rows = await prisma.roOpFact.findMany({
    where: { storeId, ...opDateWhere(range) },
    distinct: ["documentId"],
    select: { documentId: true },
  });
  return rows.map((r) => r.documentId);
}

/**
 * RO-level daily buckets off RoFact (one row per RO, so _count is an RO count).
 * Money here is all-pay; when a pay filter is active callers overlay op-level
 * money. For activity basis an RO is bucketed once — on openDate if opened in
 * range, else on firstCloseDate (the "dedup per RO" of D2).
 */
async function roDaily(
  storeId: string,
  range: ReportRange,
  docIds: string[] | null,
  extra: Record<string, unknown> = {},
): Promise<Map<string, DailyBucket>> {
  const gte = ymdToUtc(range.startDate), lte = ymdToUtc(range.endDate);
  const col = dateCol(range.basis);
  const grp = (byCol: string, where: Record<string, unknown>) =>
    (prisma.roFact.groupBy as any)({
      by: [byCol],
      where: { storeId, status: { in: resolveStatuses(range.statuses) }, ...(docIds ? { documentId: { in: docIds } } : {}), ...extra, ...where },
      _count: true,
      _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true },
      orderBy: { [byCol]: "asc" },
    });
  const toBucket = (d: any, byCol: string): [string, DailyBucket] => [
    utcToYmd(d[byCol]),
    {
      count: d._count ?? 0,
      laborSale: d._sum?.laborSale ?? 0, laborCost: d._sum?.laborCost ?? 0,
      partsSale: d._sum?.partsSale ?? 0, partsCost: d._sum?.partsCost ?? 0,
      billHours: d._sum?.billHours ?? 0,
    },
  ];
  let rows: Array<[string, DailyBucket]>;
  if (range.basis === "activity") {
    const [opened, closedOnly] = await Promise.all([
      grp("openDate", { openDate: { gte, lte } }),
      grp("firstCloseDate", { firstCloseDate: { gte, lte }, openDate: { not: { gte, lte } } }),
    ]);
    rows = [...opened.map((d: any) => toBucket(d, "openDate")), ...closedOnly.map((d: any) => toBucket(d, "firstCloseDate"))];
  } else {
    rows = (await grp(col, { [col]: { gte, lte } })).map((d: any) => toBucket(d, col));
  }
  const m = new Map<string, DailyBucket>();
  for (const [date, b] of rows) {
    const cur = m.get(date) ?? emptyBucket();
    cur.count += b.count; cur.laborSale += b.laborSale; cur.laborCost += b.laborCost;
    cur.partsSale += b.partsSale; cur.partsCost += b.partsCost; cur.billHours += b.billHours;
    m.set(date, cur);
  }
  return m;
}

/** Op-level daily money (pay filter active): sums labor/parts/hours per day. */
async function opDailyMoney(storeId: string, range: ReportRange): Promise<Map<string, DailyBucket>> {
  const gte = ymdToUtc(range.startDate), lte = ymdToUtc(range.endDate);
  const col = dateCol(range.basis);
  const base = { storeId, roStatus: { in: resolveStatuses(range.statuses) }, payClass: { in: resolvePayClasses(range.payClasses) } };
  const grp = (byCol: string, where: Record<string, unknown>) =>
    (prisma.roOpFact.groupBy as any)({
      by: [byCol], where: { ...base, ...where }, _sum: OP_MONEY_SUM, orderBy: { [byCol]: "asc" },
    });
  const toBucket = (d: any, byCol: string): [string, DailyBucket] => [
    utcToYmd(d[byCol]),
    { count: 0, laborSale: d._sum?.laborSale ?? 0, laborCost: d._sum?.laborCost ?? 0, partsSale: d._sum?.partsSale ?? 0, partsCost: d._sum?.partsCost ?? 0, billHours: d._sum?.billHours ?? 0 },
  ];
  let rows: Array<[string, DailyBucket]>;
  if (range.basis === "activity") {
    const [opened, closedOnly] = await Promise.all([
      grp("openDate", { openDate: { gte, lte } }),
      grp("firstCloseDate", { firstCloseDate: { gte, lte }, openDate: { not: { gte, lte } } }),
    ]);
    rows = [...opened.map((d: any) => toBucket(d, "openDate")), ...closedOnly.map((d: any) => toBucket(d, "firstCloseDate"))];
  } else {
    rows = (await grp(col, { [col]: { gte, lte } })).map((d: any) => toBucket(d, col));
  }
  const m = new Map<string, DailyBucket>();
  for (const [date, b] of rows) {
    const cur = m.get(date) ?? emptyBucket();
    cur.laborSale += b.laborSale; cur.laborCost += b.laborCost; cur.partsSale += b.partsSale; cur.partsCost += b.partsCost; cur.billHours += b.billHours;
    m.set(date, cur);
  }
  return m;
}

/**
 * Op-level menu daily series (pay filter active): distinct menu-sale ROs,
 * line count and labor/parts dollars per day. Activity basis merges the
 * opened-in-range and closed-only buckets (same dedup rule as roDaily).
 */
async function opMenuDaily(storeId: string, range: ReportRange): Promise<Map<string, { menuRos: number; menuLines: number; menuLaborSale: number; menuPartsSale: number }>> {
  const gte = ymdToUtc(range.startDate), lte = ymdToUtc(range.endDate);
  const col = dateCol(range.basis);
  const base = { storeId, roStatus: { in: resolveStatuses(range.statuses) }, payClass: { in: resolvePayClasses(range.payClasses) }, isMenuSale: true };
  const sumQ = (byCol: string, where: Record<string, unknown>) =>
    (prisma.roOpFact.groupBy as any)({ by: [byCol], where: { ...base, ...where }, _count: true, _sum: { laborSale: true, partsSale: true }, orderBy: { [byCol]: "asc" } });
  const rosQ = (byCol: string, where: Record<string, unknown>) =>
    (prisma.roOpFact.groupBy as any)({ by: [byCol, "documentId"], where: { ...base, ...where } });
  let sumRows: Array<[string, any]>, rosRows: Array<[string, string]>;
  if (range.basis === "activity") {
    const [sO, sC, rO, rC] = await Promise.all([
      sumQ("openDate", { openDate: { gte, lte } }),
      sumQ("firstCloseDate", { firstCloseDate: { gte, lte }, openDate: { not: { gte, lte } } }),
      rosQ("openDate", { openDate: { gte, lte } }),
      rosQ("firstCloseDate", { firstCloseDate: { gte, lte }, openDate: { not: { gte, lte } } }),
    ]);
    sumRows = [...sO.map((d: any) => [utcToYmd(d.openDate), d]), ...sC.map((d: any) => [utcToYmd(d.firstCloseDate), d])];
    rosRows = [...rO.map((d: any) => [utcToYmd(d.openDate), d.documentId]), ...rC.map((d: any) => [utcToYmd(d.firstCloseDate), d.documentId])];
  } else {
    const [s, r] = await Promise.all([sumQ(col, { [col]: { gte, lte } }), rosQ(col, { [col]: { gte, lte } })]);
    sumRows = s.map((d: any) => [utcToYmd(d[col]), d]);
    rosRows = r.map((d: any) => [utcToYmd(d[col]), d.documentId]);
  }
  const m = new Map<string, { menuRos: Set<string>; menuLines: number; menuLaborSale: number; menuPartsSale: number }>();
  for (const [date, d] of sumRows) {
    const cur = m.get(date) ?? { menuRos: new Set<string>(), menuLines: 0, menuLaborSale: 0, menuPartsSale: 0 };
    cur.menuLines += d._count ?? 0; cur.menuLaborSale += d._sum?.laborSale ?? 0; cur.menuPartsSale += d._sum?.partsSale ?? 0;
    m.set(date, cur);
  }
  for (const [date, docId] of rosRows) m.get(date)?.menuRos.add(docId);
  return new Map([...m.entries()].map(([date, v]) => [date, { menuRos: v.menuRos.size, menuLines: v.menuLines, menuLaborSale: v.menuLaborSale, menuPartsSale: v.menuPartsSale }]));
}

export async function getSummary(tc: TenantContext, range: ReportRange) {
  requireStoreAccess(tc, range.storeId);
  const storeId = range.storeId;
  const payActive = payFilterActive(range.payClasses);
  const docIds = payActive ? await matchingDocIds(storeId, range) : null;
  const where = { storeId, ...dateWhere(range) };
  const roWhere = docIds ? { ...where, documentId: { in: docIds } } : where;
  const byPayType = await getPayTypeBreakdown(range);
  const [agg, closed, cp, menu, dailyMap, menuDailyMap] = await Promise.all([
    (async () => {
      if (!payActive) return prisma.roFact.aggregate({ where, _count: true, _sum: SUM_FIELDS });
      const opAgg = await prisma.roOpFact.aggregate({
        where: { storeId, ...opDateWhere(range) },
        _sum: OP_MONEY_SUM,
      });
      const s = opAgg._sum ?? {};
      const pc = (c: PayClass): PayTypeGross => byPayType.find((b) => b.payClass === c) ?? emptyPayType(c);
      return {
        _count: docIds!.length,
        _sum: {
          laborSale: s.laborSale ?? 0, laborCost: s.laborCost ?? 0,
          partsSale: s.partsSale ?? 0, partsCost: s.partsCost ?? 0, billHours: s.billHours ?? 0,
          cpLaborSale: pc("CP").laborSale, cpPartsSale: pc("CP").partsSale, cpBillHours: pc("CP").billHours,
          wLaborSale: pc("W").laborSale, wPartsSale: pc("W").partsSale, wBillHours: pc("W").billHours,
          iLaborSale: pc("I").laborSale, iPartsSale: pc("I").partsSale, iBillHours: pc("I").billHours,
          oLaborSale: pc("O").laborSale, oPartsSale: pc("O").partsSale, oBillHours: pc("O").billHours,
        },
      };
    })(),
    prisma.roFact.count({ where: { ...roWhere, isClosed: true } }),
    prisma.roFact.count({ where: { ...roWhere, isCpRo: true } }),
    prisma.roFact.count({ where: { ...roWhere, hasMenu: true } }),
    roDaily(storeId, range, docIds),
    roDaily(storeId, range, docIds, { hasMenu: true }),
  ]);
  const opMoney = payActive ? await opDailyMoney(storeId, range) : null;
  const dates = Array.from(new Set([...dailyMap.keys(), ...(opMoney ? opMoney.keys() : [])])).sort();
  const series: DailyPoint[] = dates.map((date) => {
    const b = dailyMap.get(date) ?? emptyBucket();
    const opm = opMoney?.get(date);
    const laborSale = opm ? opm.laborSale : b.laborSale;
    const laborCost = opm ? opm.laborCost : b.laborCost;
    const partsSale = opm ? opm.partsSale : b.partsSale;
    const partsCost = opm ? opm.partsCost : b.partsCost;
    return {
      date,
      roCount: b.count,
      laborSale: r2(laborSale),
      partsSale: r2(partsSale),
      laborGross: r2(laborSale - laborCost),
      partsGross: r2(partsSale - partsCost),
      billHours: r2(opm ? opm.billHours : b.billHours),
      menuRos: menuDailyMap.get(date)?.count ?? 0,
    };
  });
  const lastSync = await prisma.syncRun.findFirst({
    where: { storeId: range.storeId, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, rosFetched: true },
  });
  return {
    range,
    totals: totalsFromAgg(agg, { ro: agg._count, closed, cp, menu }, byPayType),
    series,
    lastSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Advisor performance (Tekion "Advisor Performance" shape)
// ---------------------------------------------------------------------------

export interface AdvisorRow {
  advisorId: string;
  name: string;
  persona: string | null;
  roCount: number;
  closedCount: number;
  cpRoCount: number;
  laborSale: number;
  laborGross: number;
  partsSale: number;
  partsGross: number;
  totalSale: number;
  totalGross: number;
  billHours: number;
  elr: number;
  hoursPerRo: number;
  salePerRo: number;
  menuRos: number;
  menuPenetration: number;
  cpLaborSale: number;
  wLaborSale: number;
  iLaborSale: number;
  /** Gross (sale − cost, labor + parts) by pay type. cp+w+i+o == totalGross. */
  cpGross: number;
  wGross: number;
  iGross: number;
  oGross: number;
  cpLaborGross: number;
  cpPartsGross: number;
  byPayType: Record<PayClass, PayTypeGross>;
}

export async function getAdvisorPerformance(tc: TenantContext, range: ReportRange) {
  requireStoreAccess(tc, range.storeId);
  const storeId = range.storeId;
  const payActive = payFilterActive(range.payClasses);
  const docIds = payActive ? await matchingDocIds(storeId, range) : null;
  const where = { storeId, ...dateWhere(range) };
  const roWhere = docIds ? { ...where, documentId: { in: docIds } } : where;
  const [roAgg, closed, cp, menu, advisors, payByAdv] = await Promise.all([
    payActive ? Promise.resolve(null) : prisma.roFact.groupBy({ by: ["advisorId"], where, _count: true, _sum: SUM_FIELDS }),
    prisma.roFact.groupBy({ by: ["advisorId"], where: { ...roWhere, isClosed: true }, _count: true }),
    prisma.roFact.groupBy({ by: ["advisorId"], where: { ...roWhere, isCpRo: true }, _count: true }),
    prisma.roFact.groupBy({ by: ["advisorId"], where: { ...roWhere, hasMenu: true }, _count: true }),
    prisma.advisor.findMany({
      where: { storeId },
      select: { id: true, nameRaw: true, nameNormalized: true, persona: true },
    }),
    getPayTypeBreakdownByAdvisor(range),
  ]);
  const byId = (rows: any[]) => new Map(rows.map((r) => [r.advisorId ?? "", r._count as number]));
  const closedM = byId(closed), cpM = byId(cp), menuM = byId(menu);
  const advM = new Map(advisors.map((a) => [a.id, a]));

  let agg: Array<{ advisorId: string | null; _count: number; _sum: Record<string, number | null> }>;
  if (!payActive) {
    agg = roAgg as any;
  } else {
    // Pay filter active: RO count and money come from RoOpFact (distinct ROs
    // per advisor + filtered pay classes). RoFact groupBy sums would be all-pay.
    const opRo = await prisma.roOpFact.groupBy({
      by: ["advisorId", "documentId"],
      where: { storeId, ...opDateWhere(range) },
      _count: true,
    });
    const roCountByAdv = new Map<string, number>();
    for (const r of opRo) roCountByAdv.set(r.advisorId ?? "", (roCountByAdv.get(r.advisorId ?? "") ?? 0) + 1);
    const ids = new Set<string>([...roCountByAdv.keys(), ...payByAdv.keys()]);
    agg = [...ids].map((id) => {
      const pt = payByAdv.get(id) ?? { CP: emptyPayType("CP"), W: emptyPayType("W"), I: emptyPayType("I"), O: emptyPayType("O") };
      const sum = (k: "laborSale" | "laborCost" | "partsSale" | "partsCost" | "billHours") =>
        (pt.CP[k] as number) + (pt.W[k] as number) + (pt.I[k] as number) + (pt.O[k] as number);
      return {
        advisorId: id || null,
        _count: roCountByAdv.get(id) ?? 0,
        _sum: {
          laborSale: sum("laborSale"), laborCost: sum("laborCost"),
          partsSale: sum("partsSale"), partsCost: sum("partsCost"), billHours: sum("billHours"),
          cpLaborSale: pt.CP.laborSale, cpPartsSale: pt.CP.partsSale, cpBillHours: pt.CP.billHours,
          wLaborSale: pt.W.laborSale, wPartsSale: pt.W.partsSale, wBillHours: pt.W.billHours,
          iLaborSale: pt.I.laborSale, iPartsSale: pt.I.partsSale, iBillHours: pt.I.billHours,
        },
      };
    });
  }

  const rows: AdvisorRow[] = agg.map((g) => {
    const s = g._sum;
    const a = g.advisorId ? advM.get(g.advisorId) : undefined;
    const laborSale = s.laborSale ?? 0, laborCost = s.laborCost ?? 0;
    const partsSale = s.partsSale ?? 0, partsCost = s.partsCost ?? 0;
    const hrs = s.billHours ?? 0;
    const n = g._count;
    const m = menuM.get(g.advisorId ?? "") ?? 0;
    const pt = payByAdv.get(g.advisorId ?? "") ?? { CP: emptyPayType("CP"), W: emptyPayType("W"), I: emptyPayType("I"), O: emptyPayType("O") };
    return {
      advisorId: g.advisorId ?? "",
      name: a?.nameRaw ?? a?.nameNormalized ?? "Unassigned",
      persona: a?.persona ?? null,
      roCount: n,
      closedCount: closedM.get(g.advisorId ?? "") ?? 0,
      cpRoCount: cpM.get(g.advisorId ?? "") ?? 0,
      laborSale: r2(laborSale), laborGross: r2(laborSale - laborCost),
      partsSale: r2(partsSale), partsGross: r2(partsSale - partsCost),
      totalSale: r2(laborSale + partsSale),
      totalGross: r2(laborSale - laborCost + partsSale - partsCost),
      billHours: r2(hrs),
      elr: div(laborSale, hrs),
      hoursPerRo: div(hrs, n),
      salePerRo: div(laborSale + partsSale, n),
      menuRos: m,
      menuPenetration: n ? r2((m / n) * 100) : 0,
      cpLaborSale: r2(s.cpLaborSale ?? 0),
      wLaborSale: r2(s.wLaborSale ?? 0),
      iLaborSale: r2(s.iLaborSale ?? 0),
      cpGross: pt.CP.totalGross,
      wGross: pt.W.totalGross,
      iGross: pt.I.totalGross,
      oGross: pt.O.totalGross,
      cpLaborGross: pt.CP.laborGross,
      cpPartsGross: pt.CP.partsGross,
      byPayType: pt,
    };
  });
  rows.sort((x, y) => y.totalSale - x.totalSale);
  return { range, rows };
}

// ---------------------------------------------------------------------------
// Menu sales — SCORECARD definition (Kevin/Tony/Ruben/Sean emailed reports):
//   a menu SALE is a strict TEK<mileage>[BPV][NS]M operation with labor > 0
//   (RoOpFact.isMenuSale). RO-level hasMenu/menuLines/menu$ are derived from
//   the same flag in buildRoFacts, so every menu number on the site ties to
//   the scorecard RO set. $0-labor menu lines are NOT sales (BC 10/21: 13 of
//   the 21 site-only ROs were $0-labor; see docs/tickets/T9 §6).
// ---------------------------------------------------------------------------

export interface MenuAdvisorRow {
  advisorId: string;
  name: string;
  roCount: number;      // ROs in range (denominator)
  menuRos: number;      // ROs with ≥1 TEK menu line
  menuLines: number;
  penetration: number;  // %
  menuLaborSale: number;
  menuPartsSale: number;
  menuTotal: number;
}

export interface MenuOpcodeRow {
  opcode: string;
  description: string | null;
  lines: number;
  laborSale: number;
  partsSale: number;
  total: number;
}

export async function getMenuSales(tc: TenantContext, range: ReportRange) {
  requireStoreAccess(tc, range.storeId);
  // The scorecard windows on Tekion closedTime (first close now — D10); an
  // INVOICED-not-yet-CLOSED RO has no close date, so it is not in the scorecard
  // until it actually closes (BC 10/21: 7 of 21 site-only ROs).
  const storeId = range.storeId;
  const payActive = payFilterActive(range.payClasses);
  const docIds = payActive ? await matchingDocIds(storeId, range) : null;
  const where = { storeId, ...dateWhere(range) };
  const roWhere = docIds ? { ...where, documentId: { in: docIds } } : where;
  const opWhere = { storeId, ...opDateWhere(range) };
  const [allByAdv, menuByAdv, lines, byOpcode, advisors, daily, opMenuDailyMap] = await Promise.all([
    prisma.roFact.groupBy({ by: ["advisorId"], where: roWhere, _count: true }),
    (async () => {
      if (!payActive) {
        return prisma.roFact.groupBy({
          by: ["advisorId"],
          where: { ...roWhere, hasMenu: true },
          _count: true,
          _sum: { menuLines: true, menuLaborSale: true, menuPartsSale: true },
        });
      }
      // Pay filter active: menu line/money come from RoOpFact (all-pay RoFact
      // menu pre-sums would overcount); menuRos = distinct menu ROs per advisor.
      const [mMoney, mRos] = await Promise.all([
        prisma.roOpFact.groupBy({
          by: ["advisorId"],
          where: { ...opWhere, isMenuSale: true },
          _count: true,
          _sum: { laborSale: true, partsSale: true },
        }),
        prisma.roOpFact.groupBy({
          by: ["advisorId", "documentId"],
          where: { ...opWhere, isMenuSale: true },
          _count: true,
        }),
      ]);
      const ros = new Map<string, number>();
      for (const r of mRos) ros.set(r.advisorId ?? "", (ros.get(r.advisorId ?? "") ?? 0) + 1);
      const ids = new Set<string>([...mMoney.map((m) => m.advisorId ?? ""), ...ros.keys()]);
      return [...ids].map((id) => {
        const mm = mMoney.find((m) => (m.advisorId ?? "") === id);
        return { advisorId: id || null, _count: ros.get(id) ?? 0, _sum: { menuLines: mm?._count ?? 0, menuLaborSale: mm?._sum.laborSale ?? 0, menuPartsSale: mm?._sum.partsSale ?? 0 } };
      });
    })(),
    prisma.roOpFact.count({ where: { ...opWhere, isMenuSale: true } }),
    prisma.roOpFact.groupBy({
      by: ["opcode"],
      where: { ...opWhere, isMenuSale: true },
      _count: true,
      _sum: { laborSale: true, partsSale: true },
      orderBy: { _count: { opcode: "desc" } },
      take: 40,
    }),
    prisma.advisor.findMany({ where: { storeId }, select: { id: true, nameRaw: true, nameNormalized: true } }),
    payActive
      ? Promise.resolve(null)
      : prisma.roFact.groupBy({
          by: [dateCol(range.basis)],
          where: { ...where, hasMenu: true },
          _count: true,
          _sum: { menuLaborSale: true, menuPartsSale: true, menuLines: true },
          orderBy: { [dateCol(range.basis)]: "asc" },
        } as any),
    payActive ? opMenuDaily(storeId, range) : Promise.resolve(null),
  ]);
  const descs = await prisma.roOpFact.findMany({
    where: { ...opWhere, isMenuSale: true, opcode: { in: byOpcode.map((o) => o.opcode) } },
    distinct: ["opcode"],
    select: { opcode: true, opcodeDesc: true },
  });
  const descM = new Map(descs.map((d) => [d.opcode, d.opcodeDesc]));
  const advM = new Map(advisors.map((a) => [a.id, a.nameRaw ?? a.nameNormalized]));
  const menuM = new Map(menuByAdv.map((m) => [m.advisorId ?? "", m]));

  const rows: MenuAdvisorRow[] = allByAdv.map((g) => {
    const m = menuM.get(g.advisorId ?? "");
    const ls = m?._sum.menuLaborSale ?? 0, ps = m?._sum.menuPartsSale ?? 0;
    return {
      advisorId: g.advisorId ?? "",
      name: (g.advisorId && advM.get(g.advisorId)) || "Unassigned",
      roCount: g._count,
      menuRos: m?._count ?? 0,
      menuLines: m?._sum.menuLines ?? 0,
      penetration: g._count ? r2(((m?._count ?? 0) / g._count) * 100) : 0,
      menuLaborSale: r2(ls),
      menuPartsSale: r2(ps),
      menuTotal: r2(ls + ps),
    };
  });
  rows.sort((x, y) => y.menuRos - x.menuRos || y.menuTotal - x.menuTotal);

  const totals = rows.reduce(
    (t, r) => ({
      roCount: t.roCount + r.roCount,
      menuRos: t.menuRos + r.menuRos,
      menuLines: t.menuLines + r.menuLines,
      menuLaborSale: r2(t.menuLaborSale + r.menuLaborSale),
      menuPartsSale: r2(t.menuPartsSale + r.menuPartsSale),
      menuTotal: r2(t.menuTotal + r.menuTotal),
    }),
    { roCount: 0, menuRos: 0, menuLines: 0, menuLaborSale: 0, menuPartsSale: 0, menuTotal: 0 },
  );

  const series = payActive
    ? [...(opMenuDailyMap?.keys() ?? [])].sort().map((date) => {
        const m = opMenuDailyMap!.get(date)!;
        return { date, menuRos: m.menuRos, menuLines: m.menuLines, menuTotal: r2(m.menuLaborSale + m.menuPartsSale) };
      })
    : (daily as any[]).map((d) => ({
        date: utcToYmd(d[dateCol(range.basis)]),
        menuRos: d._count,
        menuLines: d._sum.menuLines ?? 0,
        menuTotal: r2((d._sum.menuLaborSale ?? 0) + (d._sum.menuPartsSale ?? 0)),
      }));

  return {
    range,
    totals: { ...totals, penetration: totals.roCount ? r2((totals.menuRos / totals.roCount) * 100) : 0, lines },
    rows,
    opcodes: byOpcode.map<MenuOpcodeRow>((o) => ({
      opcode: o.opcode,
      description: descM.get(o.opcode) ?? null,
      lines: o._count,
      laborSale: r2(o._sum.laborSale ?? 0),
      partsSale: r2(o._sum.partsSale ?? 0),
      total: r2((o._sum.laborSale ?? 0) + (o._sum.partsSale ?? 0)),
    })),
    series,
  };
}

// ---------------------------------------------------------------------------
// Opcode / commodity explorer (alignments, tires, filters… any opcode set)
// ---------------------------------------------------------------------------

export interface OpcodeExplorerParams extends ReportRange {
  /** Exact opcodes (normalized upper) — OR — */
  opcodes?: string[];
  /** Case-insensitive substring on opcode or description. */
  search?: string;
  /** Restrict to a category: MENU | ALA | COMMODITY | REC | OTHER */
  category?: string;
  commodityKey?: string;
}

export async function getOpcodeExplorer(tc: TenantContext, p: OpcodeExplorerParams) {
  requireStoreAccess(tc, p.storeId);
  const where: any = { storeId: p.storeId, ...opDateWhere(p) };
  if (p.opcodes?.length) where.opcode = { in: p.opcodes.map((o) => o.trim().toUpperCase()) };
  if (p.category) where.category = p.category;
  if (p.commodityKey) where.commodityKey = p.commodityKey;
  if (p.search) {
    where.OR = [
      { opcode: { contains: p.search.toUpperCase() } },
      { opcodeDesc: { contains: p.search, mode: "insensitive" } },
    ];
  }
  const [byOpcode, byAdvisor, advisors, roDistinct] = await Promise.all([
    prisma.roOpFact.groupBy({
      by: ["opcode"], where, _count: true,
      _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true, partsQty: true },
      orderBy: { _count: { opcode: "desc" } }, take: 100,
    }),
    prisma.roOpFact.groupBy({
      by: ["advisorId"], where, _count: true,
      _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true, partsQty: true },
    }),
    prisma.advisor.findMany({ where: { storeId: p.storeId }, select: { id: true, nameRaw: true, nameNormalized: true } }),
    prisma.roOpFact.findMany({ where, distinct: ["documentId"], select: { documentId: true } }),
  ]);
  const advRoCounts = await prisma.roOpFact.groupBy({ by: ["advisorId", "documentId"], where, _count: true });
  const advRoMap = new Map<string, number>();
  for (const r of advRoCounts) advRoMap.set(r.advisorId ?? "", (advRoMap.get(r.advisorId ?? "") ?? 0) + 1);
  const advM = new Map(advisors.map((a) => [a.id, a.nameRaw ?? a.nameNormalized]));
  const descs = await prisma.roOpFact.findMany({
    where: { ...where, opcode: { in: byOpcode.map((o) => o.opcode) } },
    distinct: ["opcode"], select: { opcode: true, opcodeDesc: true },
  });
  const descM = new Map(descs.map((d) => [d.opcode, d.opcodeDesc]));
  const fmt = (s: any) => ({
    laborSale: r2(s.laborSale ?? 0), laborGross: r2((s.laborSale ?? 0) - (s.laborCost ?? 0)),
    partsSale: r2(s.partsSale ?? 0), partsGross: r2((s.partsSale ?? 0) - (s.partsCost ?? 0)),
    total: r2((s.laborSale ?? 0) + (s.partsSale ?? 0)), billHours: r2(s.billHours ?? 0), partsQty: r2(s.partsQty ?? 0),
  });
  return {
    range: p,
    totalLines: byOpcode.reduce((n, o) => n + o._count, 0),
    totalRos: roDistinct.length,
    opcodes: byOpcode.map((o) => ({ opcode: o.opcode, description: descM.get(o.opcode) ?? null, lines: o._count, ...fmt(o._sum) })),
    advisors: byAdvisor
      .map((a) => ({ advisorId: a.advisorId ?? "", name: (a.advisorId && advM.get(a.advisorId)) || "Unassigned", lines: a._count, ros: advRoMap.get(a.advisorId ?? "") ?? 0, ...fmt(a._sum) }))
      .sort((x, y) => y.lines - x.lines),
  };
}

/** RO-level drill-down for an opcode filter / advisor (detail pages, CSV export). */
export async function getOpcodeLines(tc: TenantContext, p: OpcodeExplorerParams & { advisorId?: string; limit?: number }) {
  requireStoreAccess(tc, p.storeId);
  const where: any = { storeId: p.storeId, ...opDateWhere(p) };
  if (p.opcodes?.length) where.opcode = { in: p.opcodes.map((o) => o.trim().toUpperCase()) };
  if (p.category) where.category = p.category;
  if (p.advisorId) where.advisorId = p.advisorId;
  if (p.search) where.OR = [{ opcode: { contains: p.search.toUpperCase() } }, { opcodeDesc: { contains: p.search, mode: "insensitive" } }];
  const rows = await prisma.roOpFact.findMany({
    where,
    orderBy: [{ [dateCol(p.basis)]: "desc" }, { documentNumber: "desc" }] as any,
    take: Math.min(p.limit ?? 500, 2000),
    select: {
      documentNumber: true, openDate: true, closeDate: true, opcode: true, opcodeDesc: true, payClass: true,
      laborSale: true, partsSale: true, billHours: true, partsQty: true,
      advisor: { select: { nameRaw: true, nameNormalized: true } },
      roFact: { select: { year: true, make: true, model: true, vin: true, mileage: true, status: true } },
    },
  });
  return rows.map((r) => ({
    ro: r.documentNumber,
    openDate: utcToYmd(r.openDate),
    closeDate: r.closeDate ? utcToYmd(r.closeDate) : null,
    status: r.roFact.status,
    advisor: r.advisor?.nameRaw ?? r.advisor?.nameNormalized ?? "Unassigned",
    vehicle: [r.roFact.year, r.roFact.make, r.roFact.model].filter(Boolean).join(" "),
    vin: r.roFact.vin,
    mileage: r.roFact.mileage,
    opcode: r.opcode,
    description: r.opcodeDesc,
    pay: r.payClass,
    laborSale: r.laborSale,
    partsSale: r.partsSale,
    total: r2(r.laborSale + r.partsSale),
    billHours: r.billHours,
    partsQty: r.partsQty,
  }));
}

// ---------------------------------------------------------------------------
// RO list (the Kim tie-out view: every RO in range with both dates)
// ---------------------------------------------------------------------------

export async function getRoList(tc: TenantContext, range: ReportRange & { advisorId?: string; status?: "open" | "closed" | "all"; limit?: number }) {
  requireStoreAccess(tc, range.storeId);
  const storeId = range.storeId;
  const payActive = payFilterActive(range.payClasses);
  const docIds = payActive ? await matchingDocIds(storeId, range) : null;
  const where: any = { storeId, ...dateWhere(range) };
  if (docIds) where.documentId = { in: docIds };
  if (range.advisorId) where.advisorId = range.advisorId;
  if (range.status === "open") where.isClosed = false;
  if (range.status === "closed") where.isClosed = true;
  const rows = await prisma.roFact.findMany({
    where,
    orderBy: [{ [dateCol(range.basis)]: "desc" }, { documentNumber: "desc" }] as any,
    take: Math.min(range.limit ?? 1000, 5000),
    select: {
      documentId: true, documentNumber: true, status: true, roType: true, openDate: true, closeDate: true, isClosed: true,
      year: true, make: true, model: true, vin: true, mileage: true,
      laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true,
      cpLaborSale: true, cpPartsSale: true, wLaborSale: true, wPartsSale: true, iLaborSale: true, iPartsSale: true,
      hasMenu: true, menuLines: true,
      advisor: { select: { nameRaw: true, nameNormalized: true } },
    },
  });
  // Under a pay filter, per-RO money/split must come from matching ops, not the
  // all-pay RoFact pre-sums (a CP+W RO would otherwise show both when W is hidden).
  let opByRo: Map<string, { laborSale: number; laborCost: number; partsSale: number; partsCost: number; billHours: number; cp: number; w: number; i: number; o: number }> | null = null;
  if (payActive && rows.length) {
    const g = await prisma.roOpFact.groupBy({
      by: ["documentId", "payClass"],
      where: { storeId, ...opDateWhere(range), documentId: { in: rows.map((r) => r.documentId) } },
      _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true },
    });
    opByRo = new Map();
    for (const r of g) {
      const e = opByRo.get(r.documentId) ?? { laborSale: 0, laborCost: 0, partsSale: 0, partsCost: 0, billHours: 0, cp: 0, w: 0, i: 0, o: 0 };
      e.laborSale += r._sum.laborSale ?? 0; e.laborCost += r._sum.laborCost ?? 0;
      e.partsSale += r._sum.partsSale ?? 0; e.partsCost += r._sum.partsCost ?? 0; e.billHours += r._sum.billHours ?? 0;
      const tot = (r._sum.laborSale ?? 0) + (r._sum.partsSale ?? 0);
      if (r.payClass === "CP") e.cp += tot; else if (r.payClass === "W") e.w += tot; else if (r.payClass === "I") e.i += tot; else e.o += tot;
      opByRo.set(r.documentId, e);
    }
  }
  return rows.map((r) => {
    const e = opByRo?.get(r.documentId);
    const laborSale = e ? e.laborSale : r.laborSale;
    const laborCost = e ? e.laborCost : r.laborCost;
    const partsSale = e ? e.partsSale : r.partsSale;
    const partsCost = e ? e.partsCost : r.partsCost;
    return {
      ro: r.documentNumber,
      status: r.status,
      type: r.roType,
      openDate: utcToYmd(r.openDate),
      closeDate: r.closeDate ? utcToYmd(r.closeDate) : null,
      isClosed: r.isClosed,
      advisor: r.advisor?.nameRaw ?? r.advisor?.nameNormalized ?? "Unassigned",
      vehicle: [r.year, r.make, r.model].filter(Boolean).join(" "),
      vin: r.vin,
      mileage: r.mileage,
      laborSale,
      partsSale,
      totalSale: r2(laborSale + partsSale),
      gross: r2(laborSale - laborCost + partsSale - partsCost),
      billHours: e ? e.billHours : r.billHours,
      cp: r2(e ? e.cp : r.cpLaborSale + r.cpPartsSale),
      warranty: r2(e ? e.w : r.wLaborSale + r.wPartsSale),
      internal: r2(e ? e.i : r.iLaborSale + r.iPartsSale),
      hasMenu: r.hasMenu,
      menuLines: r.menuLines,
    };
  });
}

// ---------------------------------------------------------------------------
// Fleet rollup (all accessible stores, one row each)
// ---------------------------------------------------------------------------

export async function getFleetRollup(tc: TenantContext, p: { startDate: string; endDate: string; basis: DateBasis; statuses?: string[]; payClasses?: PayClass[] }) {
  const storeIds = tc.org.accessibleStoreIds;
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds }, organizationId: tc.org.organizationId },
    select: { id: true, name: true, abbreviation: true, apiSyncEnabled: true },
    orderBy: { name: "asc" },
  });
  // One grouped-by-store query per metric (6 total) instead of 6 queries × N
  // stores fired in parallel — 42 concurrent queries through a 10-connection
  // pgbouncer pool was timing out ("Timed out fetching a new connection").
  const ids = stores.map((s) => s.id);
  const payActive = payFilterActive(p.payClasses);
  const anyRange: ReportRange = { storeId: "", startDate: p.startDate, endDate: p.endDate, basis: p.basis, statuses: p.statuses, payClasses: p.payClasses };
  const where = { storeId: { in: ids }, ...dateWhere(anyRange) };
  const opWhere = { storeId: { in: ids }, ...opDateWhere(anyRange) };
  const [agg, closed, cp, menu, lastSyncs, payAgg, opRoAgg] = await Promise.all([
    payActive
      ? Promise.resolve(null)
      : prisma.roFact.groupBy({ by: ["storeId"], where, _count: true, _sum: SUM_FIELDS }),
    prisma.roFact.groupBy({ by: ["storeId"], where: { ...where, isClosed: true }, _count: true }),
    prisma.roFact.groupBy({ by: ["storeId"], where: { ...where, isCpRo: true }, _count: true }),
    prisma.roFact.groupBy({ by: ["storeId"], where: { ...where, hasMenu: true }, _count: true }),
    prisma.syncRun.findMany({
      where: { storeId: { in: ids }, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } },
      orderBy: { finishedAt: "desc" }, distinct: ["storeId"], select: { storeId: true, finishedAt: true },
    }),
    prisma.roOpFact.groupBy({
      by: ["storeId", "payClass"], where: opWhere, _count: true,
      _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true },
    }),
    // distinct ROs per store among matching ops — used for the pay-filtered RO count
    payActive ? prisma.roOpFact.groupBy({ by: ["storeId", "documentId"], where: opWhere, _count: true }) : Promise.resolve(null),
  ]);
  const cnt = (rows: Array<{ storeId: string; _count: number }>) => new Map(rows.map((r) => [r.storeId, r._count]));
  const aggM = new Map((agg ?? []).map((r) => [r.storeId, r]));
  const closedM = cnt(closed), cpM = cnt(cp), menuM = cnt(menu);
  const syncM = new Map(lastSyncs.map((r) => [r.storeId, r.finishedAt]));
  const payM = new Map<string, Map<PayClass, any>>();
  for (const r of payAgg) {
    if (!payM.has(r.storeId)) payM.set(r.storeId, new Map());
    payM.get(r.storeId)!.set(r.payClass as PayClass, r);
  }
  const opRoM = new Map<string, number>();
  if (opRoAgg) for (const r of opRoAgg) opRoM.set(r.storeId, (opRoM.get(r.storeId) ?? 0) + 1);
  const rows = stores.map((s) => {
    const pm = payM.get(s.id) ?? new Map();
    const byPayType = PAY_ORDER.map((pc) => { const r = pm.get(pc); return r ? payTypeFromAgg(pc, r._count, r._sum) : emptyPayType(pc); });
    let a: any = aggM.get(s.id) ?? { _count: 0, _sum: {} };
    let ro = a._count;
    if (payActive) {
      const pc = (c: PayClass) => byPayType.find((b) => b.payClass === c) ?? emptyPayType(c);
      a = {
        _count: opRoM.get(s.id) ?? 0,
        _sum: {
          laborSale: pc("CP").laborSale + pc("W").laborSale + pc("I").laborSale + pc("O").laborSale,
          laborCost: pc("CP").laborCost + pc("W").laborCost + pc("I").laborCost + pc("O").laborCost,
          partsSale: pc("CP").partsSale + pc("W").partsSale + pc("I").partsSale + pc("O").partsSale,
          partsCost: pc("CP").partsCost + pc("W").partsCost + pc("I").partsCost + pc("O").partsCost,
          billHours: pc("CP").billHours + pc("W").billHours + pc("I").billHours + pc("O").billHours,
          cpLaborSale: pc("CP").laborSale, cpPartsSale: pc("CP").partsSale, cpBillHours: pc("CP").billHours,
          wLaborSale: pc("W").laborSale, wPartsSale: pc("W").partsSale, wBillHours: pc("W").billHours,
          iLaborSale: pc("I").laborSale, iPartsSale: pc("I").partsSale, iBillHours: pc("I").billHours,
          oLaborSale: pc("O").laborSale, oPartsSale: pc("O").partsSale, oBillHours: pc("O").billHours,
        },
      };
      ro = a._count;
    }
    return {
      storeId: s.id, name: s.name, abbreviation: s.abbreviation, apiSyncEnabled: s.apiSyncEnabled,
      lastSyncAt: syncM.get(s.id)?.toISOString() ?? null,
      ...totalsFromAgg(a, { ro, closed: closedM.get(s.id) ?? 0, cp: cpM.get(s.id) ?? 0, menu: menuM.get(s.id) ?? 0 }, byPayType),
    };
  });
  return { range: p, rows };
}

// ---------------------------------------------------------------------------
// Composition strip (D4/D5) — the chip strip that shows the FULL picture of the
// range (no status/pay filters here, by design: chips always show everything so
// the user can see what they're hiding).
// ---------------------------------------------------------------------------

export interface CompositionResult {
  range: { storeId: string; startDate: string; endDate: string; basis: DateBasis };
  byStatus: Array<{ status: string; count: number; laborSale: number; partsSale: number }>;
  byPay: Array<{ payClass: PayClass; roCount: number; laborSale: number; partsSale: number }>;
  reclosed: { count: number; laborSale: number; partsSale: number };
}

export async function getComposition(tc: TenantContext, p: { storeId: string; startDate: string; endDate: string; basis: DateBasis }) {
  requireStoreAccess(tc, p.storeId);
  const gte = ymdToUtc(p.startDate), lte = ymdToUtc(p.endDate);
  const dateClause =
    p.basis === "opened"
      ? { openDate: { gte, lte } }
      : p.basis === "activity"
        ? { OR: [{ openDate: { gte, lte } }, { firstCloseDate: { gte, lte } }] }
        : { firstCloseDate: { gte, lte } };
  const [byStatus, byPay, reclosed, opRoCount] = await Promise.all([
    prisma.roFact.groupBy({
      by: ["status"],
      where: { storeId: p.storeId, ...dateClause },
      _count: true,
      _sum: { laborSale: true, partsSale: true },
    }),
    prisma.roOpFact.groupBy({
      by: ["payClass"],
      where: { storeId: p.storeId, ...dateClause },
      _sum: { laborSale: true, partsSale: true },
    }),
    prisma.roFact.aggregate({
      where: { storeId: p.storeId, ...dateClause, wasReclosed: true },
      _count: { _all: true },
      _sum: { laborSale: true, partsSale: true },
    }),
    prisma.roOpFact.groupBy({
      by: ["payClass", "documentId"],
      where: { storeId: p.storeId, ...dateClause },
      _count: true,
    }),
  ]);
  const roByPay = new Map<string, number>();
  for (const r of opRoCount) roByPay.set(r.payClass, (roByPay.get(r.payClass) ?? 0) + 1);
  return {
    range: p,
    byStatus: byStatus
      .map((s) => ({ status: s.status ?? "(none)", count: s._count, laborSale: r2(s._sum.laborSale ?? 0), partsSale: r2(s._sum.partsSale ?? 0) }))
      .sort((a, b) => b.laborSale + b.partsSale - (a.laborSale + a.partsSale)),
    byPay: ALL_PAY_CLASSES.map((pc) => {
      const r = byPay.find((x) => x.payClass === pc);
      return { payClass: pc, roCount: roByPay.get(pc) ?? 0, laborSale: r2(r?._sum.laborSale ?? 0), partsSale: r2(r?._sum.partsSale ?? 0) };
    }),
    reclosed: { count: reclosed._count._all, laborSale: r2(reclosed._sum.laborSale ?? 0), partsSale: r2(reclosed._sum.partsSale ?? 0) },
  };
}
