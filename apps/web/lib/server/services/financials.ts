import "server-only";

/**
 * Financials service — reads GlAccountDaily (daily snapshots of Tekion's
 * financial-statement engine, collected by scripts/gl-snapshot.ts).
 *
 * This is the GL / financial-statement view of the department: the SAME
 * numbers printed on the OEM statement and what the controller / Kim pull
 * from Tekion's Financial Statement screen. It is deliberately separate from
 * the RO-line "RO gross" in reports.ts — they answer different questions and
 * reconcile only at month-end after all postings land.
 *
 * Sign convention (Tekion stores as-is): SALE accounts are credit-normal and
 * come back NEGATIVE; COST_OF_SALE / OPERATING_EXPENSE positive. We flip
 * sales to positive for display. gross = sales − cost.
 */

import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/server/tenant-context";
import { requireStoreAccess } from "@/lib/server/authz";

const r2 = (n: number) => Math.round(n * 100) / 100;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const asUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);

export type DeptKey = "SERVICE" | "PARTS" | "BODY_SHOP";
const DEPTS: DeptKey[] = ["SERVICE", "PARTS", "BODY_SHOP"];

export interface DeptTotals { sales: number; cost: number; gross: number; grossPct: number; roCount: number; expenses: number }
export interface FsLineRow {
  department: string;
  fsGroup: string | null;
  fsLine: string;
  fsPage: number | null;
  accounts: Array<{ glAccountId: string; accountNumber: string; accountName: string; accountType: string; mtd: number; daily: number; period: number; mtdCount: number }>;
  sales: number; cost: number; gross: number; roCount: number;   // for the selected period
  mtdSales: number; mtdCost: number; mtdGross: number; mtdCount: number; // as of endDate
}
export interface FinDailyPoint { date: string; serviceSales: number; serviceGross: number; partsSales: number; partsGross: number; serviceRos: number }

function emptyTotals(): DeptTotals { return { sales: 0, cost: 0, gross: 0, grossPct: 0, roCount: 0, expenses: 0 }; }

/**
 * Period activity = Σ daily over [start, end]. Because `daily` is computed
 * as mtd(d) − mtd(previous snapshot in the same month), summing dailies over
 * any contiguous range inside a month equals mtd(end) − mtd(day before start),
 * and across month boundaries it naturally restarts. Missing snapshot days
 * simply roll into the next captured day (no double count).
 */
export async function getFinancials(tc: TenantContext, p: { storeId: string; startDate: string; endDate: string }) {
  requireStoreAccess(tc, p.storeId);
  const start = asUtc(p.startDate), end = asUtc(p.endDate);

  const [rows, latest] = await Promise.all([
    prisma.glAccountDaily.findMany({
      where: { storeId: p.storeId, asOfDate: { gte: start, lte: end } },
      select: { asOfDate: true, glAccountId: true, accountNumber: true, accountName: true, accountType: true, department: true, fsGroup: true, fsLine: true, fsPage: true, mtd: true, daily: true, mtdCount: true },
      orderBy: [{ asOfDate: "asc" }],
    }),
    prisma.glAccountDaily.findFirst({ where: { storeId: p.storeId }, orderBy: { asOfDate: "desc" }, select: { asOfDate: true, updatedAt: true } }),
  ]);

  if (!rows.length) {
    return { range: p, asOf: null, lastSnapshotAt: latest?.updatedAt?.toISOString() ?? null, latestSnapshotDate: latest ? ymd(latest.asOfDate) : null, totals: { SERVICE: emptyTotals(), PARTS: emptyTotals(), BODY_SHOP: emptyTotals() }, lines: [] as FsLineRow[], series: [] as FinDailyPoint[] };
  }

  const lastDate = rows[rows.length - 1].asOfDate;
  const lastYmd = ymd(lastDate);

  // ---- per-account period + MTD(end) ------------------------------------
  type Acc = { meta: typeof rows[number]; period: number; mtd: number; mtdCount: number };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const a = acc.get(r.glAccountId) ?? { meta: r, period: 0, mtd: 0, mtdCount: 0 };
    a.period += r.daily;
    if (ymd(r.asOfDate) === lastYmd) { a.mtd = r.mtd; a.mtdCount = r.mtdCount; a.meta = r; }
    acc.set(r.glAccountId, a);
  }

  const isSale = (t: string) => t === "SALE";
  const isCost = (t: string) => t === "COST_OF_SALE";
  const isExp = (t: string) => t === "OPERATING_EXPENSE";
  const signed = (t: string, v: number) => (isSale(t) ? -v : v);

  // ---- department totals -------------------------------------------------
  const totals: Record<DeptKey, DeptTotals> = { SERVICE: emptyTotals(), PARTS: emptyTotals(), BODY_SHOP: emptyTotals() };
  for (const a of acc.values()) {
    const d = a.meta.department as DeptKey | null;
    if (!d || !DEPTS.includes(d)) continue;
    const t = a.meta.accountType;
    const v = signed(t, a.period);
    if (isSale(t)) { totals[d].sales += v; totals[d].roCount += 0; }
    else if (isCost(t)) totals[d].cost += v;
    else if (isExp(t)) totals[d].expenses += v;
  }
  for (const d of DEPTS) {
    const t = totals[d];
    t.sales = r2(t.sales); t.cost = r2(t.cost); t.expenses = r2(t.expenses);
    t.gross = r2(t.sales - t.cost); t.grossPct = t.sales ? r2((t.gross / t.sales) * 100) : 0;
  }

  // ---- FS lines (group sale + cost accounts that share an FS line) ---------
  // Tekion maps the sale account and its cost account to different group codes
  // (_4400 vs _6400). We pair them by FS line *number* within a department
  // (SCT: 4400↔6400; VW: 4402↔5402) using the account number's trailing digits.
  const lineKey = (r: typeof rows[number]) => `${r.department ?? "—"}|${r.fsLine ?? r.accountNumber}`;
  const byLine = new Map<string, FsLineRow>();
  for (const a of acc.values()) {
    const m = a.meta;
    if (!m.department || !DEPTS.includes(m.department as DeptKey)) continue;
    if (!isSale(m.accountType) && !isCost(m.accountType)) continue;
    const k = lineKey(m);
    const row = byLine.get(k) ?? { department: m.department, fsGroup: m.fsGroup, fsLine: m.fsLine ?? m.accountName, fsPage: m.fsPage, accounts: [], sales: 0, cost: 0, gross: 0, roCount: 0, mtdSales: 0, mtdCost: 0, mtdGross: 0, mtdCount: 0 };
    row.accounts.push({ glAccountId: m.glAccountId, accountNumber: m.accountNumber, accountName: m.accountName, accountType: m.accountType, mtd: r2(signed(m.accountType, a.mtd)), daily: 0, period: r2(signed(m.accountType, a.period)), mtdCount: a.mtdCount });
    if (isSale(m.accountType)) { row.sales += -a.period; row.mtdSales += -a.mtd; row.mtdCount += a.mtdCount; }
    else { row.cost += a.period; row.mtdCost += a.mtd; }
    byLine.set(k, row);
  }
  // Merge the cost line into its sale line when FS line names are the bare
  // account numbers ("4400" / "6400"): pair by department + last 3 digits.
  const merged = new Map<string, FsLineRow>();
  for (const row of byLine.values()) {
    const digits = (row.fsLine.match(/(\d{3})\s*$/)?.[1]) ?? row.fsLine;
    const k = `${row.department}|${digits}`;
    const tgt = merged.get(k);
    if (!tgt) { merged.set(k, row); continue; }
    tgt.accounts.push(...row.accounts);
    tgt.sales += row.sales; tgt.cost += row.cost; tgt.mtdSales += row.mtdSales; tgt.mtdCost += row.mtdCost; tgt.mtdCount += row.mtdCount;
    if (row.accounts.some((x) => isSale(x.accountType))) { tgt.fsLine = row.fsLine; tgt.fsGroup = row.fsGroup; }
  }
  const lines = [...merged.values()].map((l) => ({
    ...l,
    sales: r2(l.sales), cost: r2(l.cost), gross: r2(l.sales - l.cost),
    mtdSales: r2(l.mtdSales), mtdCost: r2(l.mtdCost), mtdGross: r2(l.mtdSales - l.mtdCost),
    accounts: l.accounts.sort((x, y) => x.accountNumber.localeCompare(y.accountNumber)),
  })).filter((l) => l.sales || l.cost || l.mtdSales || l.mtdCost)
    .sort((x, y) => (x.department.localeCompare(y.department)) || (y.mtdSales - x.mtdSales));

  // RO counts for the department = Σ counts on its sale accounts (MTD as of end)
  for (const d of DEPTS) totals[d].roCount = lines.filter((l) => l.department === d).reduce((s, l) => s + l.mtdCount, 0);

  // ---- daily series --------------------------------------------------------
  const byDay = new Map<string, FinDailyPoint>();
  for (const r of rows) {
    const d = ymd(r.asOfDate);
    const pt = byDay.get(d) ?? { date: d, serviceSales: 0, serviceGross: 0, partsSales: 0, partsGross: 0, serviceRos: 0 };
    const v = signed(r.accountType, r.daily);
    if (r.department === "SERVICE") {
      if (isSale(r.accountType)) { pt.serviceSales += v; pt.serviceGross += v; }
      else if (isCost(r.accountType)) pt.serviceGross -= v;
    } else if (r.department === "PARTS") {
      if (isSale(r.accountType)) { pt.partsSales += v; pt.partsGross += v; }
      else if (isCost(r.accountType)) pt.partsGross -= v;
    }
    byDay.set(d, pt);
  }
  // service RO count per day = Δ of Σ mtdCount on service sale accounts
  const cntByDay = new Map<string, number>();
  for (const r of rows) if (r.department === "SERVICE" && isSale(r.accountType)) cntByDay.set(ymd(r.asOfDate), (cntByDay.get(ymd(r.asOfDate)) ?? 0) + r.mtdCount);
  let prevCnt = 0, prevMonth = "";
  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((pt) => {
    const month = pt.date.slice(0, 7);
    if (month !== prevMonth) { prevCnt = 0; prevMonth = month; }
    const cnt = cntByDay.get(pt.date) ?? prevCnt;
    const out = { ...pt, serviceSales: r2(pt.serviceSales), serviceGross: r2(pt.serviceGross), partsSales: r2(pt.partsSales), partsGross: r2(pt.partsGross), serviceRos: Math.max(0, cnt - prevCnt) };
    prevCnt = cnt;
    return out;
  });

  return {
    range: p,
    asOf: lastYmd,
    latestSnapshotDate: latest ? ymd(latest.asOfDate) : null,
    lastSnapshotAt: latest?.updatedAt?.toISOString() ?? null,
    totals,
    lines,
    series,
  };
}

/** Fleet view: one row per store for the period. */
export async function getFinancialsFleet(tc: TenantContext, p: { startDate: string; endDate: string }) {
  const stores = await prisma.store.findMany({
    where: { id: { in: tc.org.accessibleStoreIds }, organizationId: tc.org.organizationId },
    select: { id: true, name: true, abbreviation: true }, orderBy: { name: "asc" },
  });
  const rows = await Promise.all(stores.map(async (s) => {
    const f = await getFinancials(tc, { storeId: s.id, ...p });
    return { storeId: s.id, name: s.name, abbreviation: s.abbreviation, asOf: f.asOf, service: f.totals.SERVICE, parts: f.totals.PARTS, bodyShop: f.totals.BODY_SHOP };
  }));
  return { range: p, rows };
}
