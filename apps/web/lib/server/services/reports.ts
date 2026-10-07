import "server-only";

/**
 * v2 reporting service — every number the dashboard shows comes from here,
 * read off RoFact / RoOpFact (never from raw payload JSON at request time).
 *
 * Date semantics are EXPLICIT on every query:
 *   basis = "opened"  → bucket by RoFact.openDate  (what Kim pulls from the
 *                       Tekion RO list filtered to created date)
 *   basis = "closed"  → bucket by RoFact.closeDate (what the Closed-MTD
 *                       scorecards and the financial statement see)
 *
 * All money is dollars. Gross = sale − cost (labor + parts) off RO lines;
 * this is "RO gross", NOT the GL/financial-statement gross (see glService).
 */

import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/server/tenant-context";
import { requireStoreAccess } from "@/lib/server/authz";

export type DateBasis = "opened" | "closed";

export interface ReportRange {
  storeId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
  basis: DateBasis;
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

function dateWhere(range: ReportRange) {
  const gte = ymdToUtc(range.startDate);
  const lte = ymdToUtc(range.endDate);
  return range.basis === "opened"
    ? { openDate: { gte, lte } }
    : { closeDate: { gte, lte } };
}
const dateCol = (b: DateBasis): "openDate" | "closeDate" => (b === "opened" ? "openDate" : "closeDate");

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

function totalsFromAgg(a: any, counts: { ro: number; closed: number; cp: number; menu: number }): SummaryTotals {
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
  };
}

const SUM_FIELDS = {
  laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true,
  cpLaborSale: true, cpPartsSale: true, cpBillHours: true,
  wLaborSale: true, wPartsSale: true, wBillHours: true,
  iLaborSale: true, iPartsSale: true, iBillHours: true,
  oLaborSale: true, oPartsSale: true, oBillHours: true,
} as const;

export async function getSummary(tc: TenantContext, range: ReportRange) {
  requireStoreAccess(tc, range.storeId);
  const where = { storeId: range.storeId, ...dateWhere(range) };
  const [agg, closed, cp, menu, daily] = await Promise.all([
    prisma.roFact.aggregate({ where, _count: true, _sum: SUM_FIELDS }),
    prisma.roFact.count({ where: { ...where, isClosed: true } }),
    prisma.roFact.count({ where: { ...where, isCpRo: true } }),
    prisma.roFact.count({ where: { ...where, hasMenu: true } }),
    prisma.roFact.groupBy({
      by: [dateCol(range.basis)],
      where,
      _count: true,
      _sum: { laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true },
      orderBy: { [dateCol(range.basis)]: "asc" },
    } as any),
  ]);
  const menuDaily = await prisma.roFact.groupBy({
    by: [dateCol(range.basis)],
    where: { ...where, hasMenu: true },
    _count: true,
  } as any);
  const menuByDate = new Map<string, number>(
    (menuDaily as any[]).map((d) => [utcToYmd(d[dateCol(range.basis)]), d._count]),
  );
  const series: DailyPoint[] = (daily as any[]).map((d) => {
    const k = utcToYmd(d[dateCol(range.basis)]);
    const s = d._sum;
    return {
      date: k,
      roCount: d._count,
      laborSale: r2(s.laborSale ?? 0),
      partsSale: r2(s.partsSale ?? 0),
      laborGross: r2((s.laborSale ?? 0) - (s.laborCost ?? 0)),
      partsGross: r2((s.partsSale ?? 0) - (s.partsCost ?? 0)),
      billHours: r2(s.billHours ?? 0),
      menuRos: menuByDate.get(k) ?? 0,
    };
  });
  const lastSync = await prisma.syncRun.findFirst({
    where: { storeId: range.storeId, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true, rosFetched: true },
  });
  return {
    range,
    totals: totalsFromAgg(agg, { ro: agg._count, closed, cp, menu }),
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
}

export async function getAdvisorPerformance(tc: TenantContext, range: ReportRange) {
  requireStoreAccess(tc, range.storeId);
  const where = { storeId: range.storeId, ...dateWhere(range) };
  const [agg, closed, cp, menu, advisors] = await Promise.all([
    prisma.roFact.groupBy({ by: ["advisorId"], where, _count: true, _sum: SUM_FIELDS }),
    prisma.roFact.groupBy({ by: ["advisorId"], where: { ...where, isClosed: true }, _count: true }),
    prisma.roFact.groupBy({ by: ["advisorId"], where: { ...where, isCpRo: true }, _count: true }),
    prisma.roFact.groupBy({ by: ["advisorId"], where: { ...where, hasMenu: true }, _count: true }),
    prisma.advisor.findMany({
      where: { storeId: range.storeId },
      select: { id: true, nameRaw: true, nameNormalized: true, persona: true },
    }),
  ]);
  const byId = (rows: any[]) => new Map(rows.map((r) => [r.advisorId ?? "", r._count as number]));
  const closedM = byId(closed), cpM = byId(cp), menuM = byId(menu);
  const advM = new Map(advisors.map((a) => [a.id, a]));

  const rows: AdvisorRow[] = agg.map((g) => {
    const s = g._sum;
    const a = g.advisorId ? advM.get(g.advisorId) : undefined;
    const laborSale = s.laborSale ?? 0, laborCost = s.laborCost ?? 0;
    const partsSale = s.partsSale ?? 0, partsCost = s.partsCost ?? 0;
    const hrs = s.billHours ?? 0;
    const n = g._count;
    const m = menuM.get(g.advisorId ?? "") ?? 0;
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
    };
  });
  rows.sort((x, y) => y.totalSale - x.totalSale);
  return { range, rows };
}

// ---------------------------------------------------------------------------
// Menu sales (mirrors the Kevin/Tony/Ruben/Sean scorecards: strict TEK menus)
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
  const where = { storeId: range.storeId, ...dateWhere(range) };
  const [allByAdv, menuByAdv, lines, byOpcode, advisors, daily] = await Promise.all([
    prisma.roFact.groupBy({ by: ["advisorId"], where, _count: true }),
    prisma.roFact.groupBy({
      by: ["advisorId"],
      where: { ...where, hasMenu: true },
      _count: true,
      _sum: { menuLines: true, menuLaborSale: true, menuPartsSale: true },
    }),
    prisma.roOpFact.count({ where: { ...where, isMenu: true } }),
    prisma.roOpFact.groupBy({
      by: ["opcode"],
      where: { ...where, isMenu: true },
      _count: true,
      _sum: { laborSale: true, partsSale: true },
      orderBy: { _count: { opcode: "desc" } },
      take: 40,
    }),
    prisma.advisor.findMany({ where: { storeId: range.storeId }, select: { id: true, nameRaw: true, nameNormalized: true } }),
    prisma.roFact.groupBy({
      by: [dateCol(range.basis)],
      where: { ...where, hasMenu: true },
      _count: true,
      _sum: { menuLaborSale: true, menuPartsSale: true, menuLines: true },
      orderBy: { [dateCol(range.basis)]: "asc" },
    } as any),
  ]);
  const descs = await prisma.roOpFact.findMany({
    where: { ...where, isMenu: true, opcode: { in: byOpcode.map((o) => o.opcode) } },
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
    series: (daily as any[]).map((d) => ({
      date: utcToYmd(d[dateCol(range.basis)]),
      menuRos: d._count,
      menuLines: d._sum.menuLines ?? 0,
      menuTotal: r2((d._sum.menuLaborSale ?? 0) + (d._sum.menuPartsSale ?? 0)),
    })),
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
  const where: any = { storeId: p.storeId, ...dateWhere(p) };
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
  const where: any = { storeId: p.storeId, ...dateWhere(p) };
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
  const where: any = { storeId: range.storeId, ...dateWhere(range) };
  if (range.advisorId) where.advisorId = range.advisorId;
  if (range.status === "open") where.isClosed = false;
  if (range.status === "closed") where.isClosed = true;
  const rows = await prisma.roFact.findMany({
    where,
    orderBy: [{ [dateCol(range.basis)]: "desc" }, { documentNumber: "desc" }] as any,
    take: Math.min(range.limit ?? 1000, 5000),
    select: {
      documentNumber: true, status: true, roType: true, openDate: true, closeDate: true, isClosed: true,
      year: true, make: true, model: true, vin: true, mileage: true,
      laborSale: true, laborCost: true, partsSale: true, partsCost: true, billHours: true,
      cpLaborSale: true, cpPartsSale: true, wLaborSale: true, wPartsSale: true, iLaborSale: true, iPartsSale: true,
      hasMenu: true, menuLines: true,
      advisor: { select: { nameRaw: true, nameNormalized: true } },
    },
  });
  return rows.map((r) => ({
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
    laborSale: r.laborSale,
    partsSale: r.partsSale,
    totalSale: r2(r.laborSale + r.partsSale),
    gross: r2(r.laborSale - r.laborCost + r.partsSale - r.partsCost),
    billHours: r.billHours,
    cp: r2(r.cpLaborSale + r.cpPartsSale),
    warranty: r2(r.wLaborSale + r.wPartsSale),
    internal: r2(r.iLaborSale + r.iPartsSale),
    hasMenu: r.hasMenu,
    menuLines: r.menuLines,
  }));
}

// ---------------------------------------------------------------------------
// Fleet rollup (all accessible stores, one row each)
// ---------------------------------------------------------------------------

export async function getFleetRollup(tc: TenantContext, p: { startDate: string; endDate: string; basis: DateBasis }) {
  const storeIds = tc.org.accessibleStoreIds;
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds }, organizationId: tc.org.organizationId },
    select: { id: true, name: true, abbreviation: true, apiSyncEnabled: true },
    orderBy: { name: "asc" },
  });
  const rows = await Promise.all(
    stores.map(async (s) => {
      const where = { storeId: s.id, ...dateWhere({ storeId: s.id, startDate: p.startDate, endDate: p.endDate, basis: p.basis }) };
      const [agg, closed, cp, menu, lastSync] = await Promise.all([
        prisma.roFact.aggregate({ where, _count: true, _sum: SUM_FIELDS }),
        prisma.roFact.count({ where: { ...where, isClosed: true } }),
        prisma.roFact.count({ where: { ...where, isCpRo: true } }),
        prisma.roFact.count({ where: { ...where, hasMenu: true } }),
        prisma.syncRun.findFirst({
          where: { storeId: s.id, status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } },
          orderBy: { finishedAt: "desc" }, select: { finishedAt: true },
        }),
      ]);
      return {
        storeId: s.id, name: s.name, abbreviation: s.abbreviation, apiSyncEnabled: s.apiSyncEnabled,
        lastSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
        ...totalsFromAgg(agg, { ro: agg._count, closed, cp, menu }),
      };
    }),
  );
  return { range: p, rows };
}
