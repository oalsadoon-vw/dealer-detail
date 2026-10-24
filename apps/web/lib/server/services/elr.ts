import "server-only";

/**
 * Effective Labor Rate (ELR) report — the "LABOR RATES / ELR" block Joe fills
 * on the AMG WIP workbook every month, computed off RoOpFact instead of the
 * Tekion Advisor Performance UI.
 *
 *   ELR = Σ labor sale ÷ Σ billed hours   (per bucket, over the window)
 *
 * Bucket recipe is the one reverse-engineered against Joe's sheet (skill
 * amg-wip-monthly-column-fill, "ELR (YTD)" section — reproduced SCT to the
 * cent for CP / INTERNAL / TXM / PDI / OTHER CP / OTHER INTERNAL):
 *
 *   CUSTOMER   payClass CP,  opcode not TAC… or TSC…   (ToyotaCare & prepaid
 *                                                      are carved out)
 *   WARRANTY   payClass W
 *   INTERNAL   payClass I,   opcode <> PDI
 *   TXM        opcode ~ ^TXM, excluding *PLUS* / *ROTATE*   (any pay type)
 *   TOYOTA CARE  opcode ~ ^TAC\d*$                           (any pay type)
 *   PREPAID    opcode ~ ^TSC\d*$                             (any pay type)
 *   PDI        opcode = PDI                                  (any pay type!)
 *   OTHER CP / OTHER W / OTHER INTERNAL  = same pay-type rows, restricted to
 *              NON-house makes (SCT/BT/TL: not toyota/scion; BC: not
 *              chevrolet/cadillac; VW stores: not volkswagen; AR: not alfa).
 *
 * Non-Toyota stores only get CP / WARRANTY / INTERNAL (+ OTHER rows); the
 * Toyota-program buckets return null hours and are hidden by the UI.
 *
 * Joe's WIP convention: Toyota stores run the ELR block on a YTD window,
 * everyone else on MTD. The UI defaults the window accordingly but the API
 * just takes whatever range it is given.
 *
 * Closed basis only honours status=CLOSED (same rule as the menu scorecard).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/server/tenant-context";
import { requireStoreAccess } from "@/lib/server/authz";
import type { ReportRange } from "./reports";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ElrBucketKey =
  | "cp" | "warranty" | "internal" | "total"
  | "txm" | "toyotaCare" | "prepaid" | "pdi"
  | "otherCp" | "otherWarranty" | "otherInternal";

export interface ElrBucket {
  key: ElrBucketKey;
  label: string;
  group: "paytype" | "program" | "other";
  laborSale: number;
  billHours: number;
  ros: number;
  elr: number | null;   // null when no hours
}

export interface ElrAdvisorRow {
  advisorId: string;
  name: string;
  cp: ElrCell; warranty: ElrCell; internal: ElrCell; total: ElrCell;
}
export interface ElrCell { laborSale: number; billHours: number; elr: number | null }

export interface ElrMonthRow {
  month: string; // YYYY-MM
  cp: number | null; warranty: number | null; internal: number | null; total: number | null;
  txm: number | null; toyotaCare: number | null; prepaid: number | null; pdi: number | null;
}

/** House makes per brand — the "OTHER *" rows are everything NOT in this list. */
const HOUSE_MAKES: Record<string, string[]> = {
  SCT: ["toyota", "scion"], BT: ["toyota", "scion"], BST: ["toyota", "scion"], TL: ["toyota", "scion"], TOL: ["toyota", "scion"],
  BC: ["chevrolet", "cadillac"],
  SV: ["volkswagen"], SCVW: ["volkswagen"], VC: ["volkswagen"], VWC: ["volkswagen"],
  AR: ["alfaromeo", "alfa romeo", "alfa"], ARSJ: ["alfaromeo", "alfa romeo", "alfa"],
};
const TOYOTA_STORES = new Set(["SCT", "BT", "BST", "TL", "TOL"]);

export function isToyotaStore(abbrev: string | null | undefined) {
  return !!abbrev && TOYOTA_STORES.has(abbrev.toUpperCase());
}

const BUCKET_DEFS: Array<{ key: ElrBucketKey; label: string; group: ElrBucket["group"]; toyotaOnly?: boolean }> = [
  { key: "cp",            label: "Customer Pay",      group: "paytype" },
  { key: "warranty",      label: "Warranty",          group: "paytype" },
  { key: "internal",      label: "Internal",          group: "paytype" },
  { key: "total",         label: "Total (all labor)", group: "paytype" },
  { key: "txm",           label: "TXM",               group: "program", toyotaOnly: true },
  { key: "toyotaCare",    label: "ToyotaCare",        group: "program", toyotaOnly: true },
  { key: "prepaid",       label: "Prepaid Maint",     group: "program", toyotaOnly: true },
  { key: "pdi",           label: "PDI",               group: "program" },
  { key: "otherCp",       label: "Other make — CP",       group: "other" },
  { key: "otherWarranty", label: "Other make — Warranty", group: "other" },
  { key: "otherInternal", label: "Other make — Internal", group: "other" },
];

/** SQL predicate (on alias o = RoOpFact, f = RoFact) for each bucket. */
function bucketSql(key: ElrBucketKey, houseMakes: string[], toyota: boolean): Prisma.Sql {
  const house = Prisma.join(houseMakes.map((m) => Prisma.sql`${m}`));
  const notHouse = Prisma.sql`lower(coalesce(f.make, '')) NOT IN (${house})`;
  // Toyota tabs carve ToyotaCare/prepaid out of CP and PDI out of Internal
  // (they get their own rows). Non-Toyota tabs are plain pay-type ELRs —
  // BC Sep: Internal incl. PDI = 207.85 vs sheet 207.77; excl. PDI = 195.50 ✗.
  const cpEx = toyota ? Prisma.sql`AND o.opcode !~ '^(TAC|TSC)'` : Prisma.empty;
  const iEx = toyota ? Prisma.sql`AND o.opcode <> 'PDI'` : Prisma.empty;
  switch (key) {
    case "cp":            return Prisma.sql`o."payClass" = 'CP' ${cpEx}`;
    case "warranty":      return Prisma.sql`o."payClass" = 'W'`;
    case "internal":      return Prisma.sql`o."payClass" = 'I' ${iEx}`;
    case "total":         return Prisma.sql`TRUE`;
    case "txm":           return Prisma.sql`o.opcode ~ '^TXM' AND o.opcode !~ '(PLUS|ROTATE)'`;
    case "toyotaCare":    return Prisma.sql`o.opcode ~ '^TAC[0-9]*$'`;
    case "prepaid":       return Prisma.sql`o.opcode ~ '^TSC[0-9]*$'`;
    case "pdi":           return Prisma.sql`o.opcode = 'PDI'`;
    case "otherCp":       return Prisma.sql`o."payClass" = 'CP' AND ${notHouse}`;
    case "otherWarranty": return Prisma.sql`o."payClass" = 'W' AND ${notHouse}`;
    case "otherInternal": return Prisma.sql`o."payClass" = 'I' AND ${notHouse}`;
  }
}

/** Same CP/Internal carve-outs as bucketSql, for the pay-type-grouped queries. */
function payTypeExclusions(toyota: boolean): Prisma.Sql {
  return toyota
    ? Prisma.sql`AND NOT (o."payClass" = 'CP' AND o.opcode ~ '^(TAC|TSC)') AND NOT (o."payClass" = 'I' AND o.opcode = 'PDI')`
    : Prisma.empty;
}

function baseWhere(range: ReportRange): Prisma.Sql {
  const col = range.basis === "opened" ? Prisma.sql`o."openDate"` : Prisma.sql`o."closeDate"`;
  const closedOnly = range.basis !== "opened" ? Prisma.sql`AND o."roStatus" = 'CLOSED'` : Prisma.empty;
  return Prisma.sql`o."storeId" = ${range.storeId}
    AND ${col} >= ${new Date(`${range.startDate}T00:00:00.000Z`)}
    AND ${col} <= ${new Date(`${range.endDate}T00:00:00.000Z`)}
    ${closedOnly}`;
}

type Agg = { ls: number | null; bh: number | null; ros: number | null };
const cell = (ls: number, bh: number): ElrCell => ({ laborSale: r2(ls), billHours: r2(bh), elr: bh ? r2(ls / bh) : null });

export async function getElr(tc: TenantContext, range: ReportRange) {
  requireStoreAccess(tc, range.storeId);
  const store = await prisma.store.findUnique({ where: { id: range.storeId }, select: { abbreviation: true, name: true } });
  const abbrev = (store?.abbreviation ?? "").toUpperCase();
  const houseMakes = HOUSE_MAKES[abbrev] ?? ["__none__"];
  const toyota = isToyotaStore(abbrev);
  const where = baseWhere(range);
  const defs = BUCKET_DEFS.filter((d) => !d.toyotaOnly || toyota);

  // ONE scan of the range with a FILTER aggregate per bucket (was 11 separate
  // joined scans in parallel — 14 s MTD / 90 s YTD on SCT; now one indexed pass).
  const bucketCols = defs.map((d) => Prisma.sql`
    sum(o."laborSale") FILTER (WHERE ${bucketSql(d.key, houseMakes, toyota)})::float AS ${Prisma.raw(`"ls_${d.key}"`)},
    sum(o."billHours") FILTER (WHERE ${bucketSql(d.key, houseMakes, toyota)})::float AS ${Prisma.raw(`"bh_${d.key}"`)},
    count(DISTINCT o."documentId") FILTER (WHERE ${bucketSql(d.key, houseMakes, toyota)})::int AS ${Prisma.raw(`"ros_${d.key}"`)}`);
  const [bAgg] = await prisma.$queryRaw<Array<Record<string, number | null>>>(Prisma.sql`
    SELECT ${Prisma.join(bucketCols, ", ")}
    FROM "RoOpFact" o JOIN "RoFact" f ON f.id = o."roFactId"
    WHERE ${where}`);
  const buckets: ElrBucket[] = defs.map((d) => {
    const ls = bAgg?.[`ls_${d.key}`] ?? 0, bh = bAgg?.[`bh_${d.key}`] ?? 0;
    return { key: d.key, label: d.label, group: d.group, laborSale: r2(ls), billHours: r2(bh), ros: bAgg?.[`ros_${d.key}`] ?? 0, elr: bh ? r2(ls / bh) : null };
  });

  // By advisor: CP / W / I / total in one grouped query.
  const advAgg = await prisma.$queryRaw<Array<{ advisorId: string | null; pc: string; ls: number; bh: number }>>(Prisma.sql`
    SELECT o."advisorId", o."payClass" AS pc, sum(o."laborSale")::float AS ls, sum(o."billHours")::float AS bh
    FROM "RoOpFact" o
    WHERE ${where} ${payTypeExclusions(toyota)}
    GROUP BY 1, 2`);
  const advisors = await prisma.advisor.findMany({ where: { storeId: range.storeId }, select: { id: true, nameRaw: true, nameNormalized: true } });
  const advName = new Map(advisors.map((a) => [a.id, a.nameRaw ?? a.nameNormalized]));
  const byAdv = new Map<string, { cp: [number, number]; w: [number, number]; i: [number, number] }>();
  for (const r of advAgg) {
    const id = r.advisorId ?? "";
    const e = byAdv.get(id) ?? { cp: [0, 0], w: [0, 0], i: [0, 0] };
    const k = r.pc === "CP" ? "cp" : r.pc === "W" ? "w" : "i";
    e[k][0] += r.ls; e[k][1] += r.bh;
    byAdv.set(id, e);
  }
  const advisorRows: ElrAdvisorRow[] = [...byAdv.entries()].map(([id, e]) => ({
    advisorId: id,
    name: (id && advName.get(id)) || "Unassigned",
    cp: cell(e.cp[0], e.cp[1]),
    warranty: cell(e.w[0], e.w[1]),
    internal: cell(e.i[0], e.i[1]),
    total: cell(e.cp[0] + e.w[0] + e.i[0], e.cp[1] + e.w[1] + e.i[1]),
  })).sort((x, y) => y.total.billHours - x.total.billHours);

  // Monthly trend — trailing 12 full months ending at the range end, same bucket math.
  const end = new Date(`${range.endDate}T00:00:00.000Z`);
  const trendStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const trendWhere = baseWhere({ ...range, startDate: trendStart.toISOString().slice(0, 10) });
  const col = range.basis === "opened" ? Prisma.sql`o."openDate"` : Prisma.sql`o."closeDate"`;
  const trendKeys: ElrBucketKey[] = toyota ? ["cp", "warranty", "internal", "total", "txm", "toyotaCare", "prepaid", "pdi"] : ["cp", "warranty", "internal", "total", "pdi"];
  // One grouped-by-month scan with a FILTER pair per bucket (was 8 full
  // 12-month joined scans in parallel).
  const trendCols = trendKeys.map((k) => Prisma.sql`
    sum(o."laborSale") FILTER (WHERE ${bucketSql(k, houseMakes, toyota)})::float AS ${Prisma.raw(`"ls_${k}"`)},
    sum(o."billHours") FILTER (WHERE ${bucketSql(k, houseMakes, toyota)})::float AS ${Prisma.raw(`"bh_${k}"`)}`);
  const trendRows = await prisma.$queryRaw<Array<Record<string, any>>>(Prisma.sql`
    SELECT to_char(${col}, 'YYYY-MM') AS mo, ${Prisma.join(trendCols, ", ")}
    FROM "RoOpFact" o
    WHERE ${trendWhere}
    GROUP BY 1 ORDER BY 1`);
  const trendM = new Map<ElrBucketKey, Map<string, number | null>>(
    trendKeys.map((k) => [k, new Map(trendRows.map((r) => [r.mo as string, r[`bh_${k}`] ? r2((r[`ls_${k}`] ?? 0) / r[`bh_${k}`]) : null]))]),
  );
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(trendStart.getUTCFullYear(), trendStart.getUTCMonth() + i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const get = (k: ElrBucketKey, mo: string) => (trendM.get(k)?.get(mo) ?? null);
  const series: ElrMonthRow[] = months.map((mo) => ({
    month: mo,
    cp: get("cp", mo), warranty: get("warranty", mo), internal: get("internal", mo), total: get("total", mo),
    txm: get("txm", mo), toyotaCare: get("toyotaCare", mo), prepaid: get("prepaid", mo), pdi: get("pdi", mo),
  }));

  return {
    range,
    store: { abbreviation: abbrev, name: store?.name ?? "", isToyota: toyota, houseMakes },
    buckets,
    advisors: advisorRows,
    series,
  };
}

/** Fleet view: CP / W / I / total ELR for every accessible store over one window. */
export async function getElrFleet(tc: TenantContext, p: { startDate: string; endDate: string; basis: ReportRange["basis"] }) {
  const stores = await prisma.store.findMany({
    where: { id: { in: tc.org.accessibleStoreIds }, organizationId: tc.org.organizationId },
    select: { id: true, name: true, abbreviation: true },
    orderBy: { name: "asc" },
  });
  // One grouped query for every store (Toyota carve-outs applied in SQL per
  // store) instead of N joined queries in parallel through the pool.
  const col = p.basis === "opened" ? Prisma.sql`o."openDate"` : Prisma.sql`o."closeDate"`;
  const closedOnly = p.basis !== "opened" ? Prisma.sql`AND o."roStatus" = 'CLOSED'` : Prisma.empty;
  const toyotaIds = stores.filter((s) => isToyotaStore(s.abbreviation)).map((s) => s.id);
  const toyotaEx = toyotaIds.length
    ? Prisma.sql`AND NOT (o."storeId" IN (${Prisma.join(toyotaIds)}) AND ((o."payClass" = 'CP' AND o.opcode ~ '^(TAC|TSC)') OR (o."payClass" = 'I' AND o.opcode = 'PDI')))`
    : Prisma.empty;
  const all = await prisma.$queryRaw<Array<{ storeId: string; pc: string; ls: number; bh: number }>>(Prisma.sql`
    SELECT o."storeId", o."payClass" AS pc, sum(o."laborSale")::float AS ls, sum(o."billHours")::float AS bh
    FROM "RoOpFact" o
    WHERE o."storeId" IN (${Prisma.join(stores.map((s) => s.id))})
      AND ${col} >= ${new Date(`${p.startDate}T00:00:00.000Z`)} AND ${col} <= ${new Date(`${p.endDate}T00:00:00.000Z`)}
      ${closedOnly} ${toyotaEx}
    GROUP BY 1, 2`);
  const rows = stores.map((s) => {
      const agg = all.filter((a) => a.storeId === s.id);
      const pick = (pc: string) => agg.find((a) => a.pc === pc);
      const cp = pick("CP"), w = pick("W"), i = pick("I");
      const tls = (cp?.ls ?? 0) + (w?.ls ?? 0) + (i?.ls ?? 0), tbh = (cp?.bh ?? 0) + (w?.bh ?? 0) + (i?.bh ?? 0);
      return {
        storeId: s.id, name: s.name, abbreviation: s.abbreviation,
        cp: cell(cp?.ls ?? 0, cp?.bh ?? 0), warranty: cell(w?.ls ?? 0, w?.bh ?? 0), internal: cell(i?.ls ?? 0, i?.bh ?? 0), total: cell(tls, tbh),
      };
  });
  return { range: p, rows };
}
