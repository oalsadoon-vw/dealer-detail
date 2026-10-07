/**
 * GL / Financial-Statement snapshot collector (host-side).
 *
 * Pulls, per store and per as-of date, every GL account's MTD/YTD balance as
 * evaluated by Tekion's financial-statements engine — the SAME numbers printed
 * on the OEM financial statement (verified vs SCT June-2026 PDF and Kim's
 * SCVW 9/5 pull). Writes GlAccountDaily.
 *
 * Auth: Tekion's internal API (not the OpenAPI) — needs a logged-in browser.
 * We use the persistent Playwright browser on :9225 (/eval endpoint) and run
 * the fetches IN PAGE so cookies + headers attach; the SuperAdmin token lets
 * us read every dealer by overriding dealerid / tek-siteId per call (no UI
 * dealer switching). Zero OpenAPI quota.
 *
 * Usage:
 *   npm run gl:snapshot                     # all API stores, yesterday + today
 *   npm run gl:snapshot -- SCVW 2026-09-01 2026-09-30   # backfill a range
 *   GL_BROWSER=http://127.0.0.1:9225 npm run gl:snapshot -- ALL 2026-10-01
 */
import { prisma } from "../lib/db";

const BROWSER = process.env.GL_BROWSER ?? "http://127.0.0.1:9225";
const TZ = "America/Los_Angeles";

type Cell = { value: number; derived?: boolean; glAccountDetails?: Array<{ glAccountId: string; value: number }> };
type Coa = Record<string, { n: string; name: string; t: string; d: string | null }>;

async function evalJs(js: string, timeoutMs = 240_000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BROWSER}/eval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ js }), signal: ctl.signal });
    const j: any = await r.json();
    if (j.error) throw new Error(`browser eval error: ${j.error}`);
    const out = typeof j.result === "string" ? j.result : JSON.stringify(j.result);
    if (typeof out === "string" && out.startsWith("ERR ")) throw new Error(out);
    return typeof j.result === "string" ? JSON.parse(j.result) : j.result;
  } finally { clearTimeout(t); }
}

/** End-of-day Pacific epoch ms for YYYY-MM-DD. */
function eodPacific(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  // Find the UTC instant whose Pacific wall-clock is 23:59:59.999 on ymd.
  const probe = Date.UTC(y, m - 1, d, 12);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" });
  const off = fmt.formatToParts(new Date(probe)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-7";
  const hrs = Number(off.replace("GMT", "") || 0);
  return Date.UTC(y, m - 1, d, 23, 59, 59, 999) - hrs * 3600_000;
}
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function todayPacific(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

const HEADER_JS = `
  var TC = JSON.parse(decodeURIComponent(document.cookie.split('tcookie=')[1].split(';')[0]));
  var H0 = {'tekion-api-token': localStorage.t_token, roleid: TC.roleId || '', tenantname: TC.tenantname || 'americanmotorscorporation',
            dealerid: DEALER, clientId: 'web', 'tek-siteId': '-1_' + DEALER, correlationId: String(Date.now()), 'Content-Type': 'application/json'};
`;

type Meta = { fsId: string; oem: string; coa: Coa; grp: Record<string, string>; groups: Record<string, { name: string; page: number | null }> };

async function fetchStoreMeta(dealer: string): Promise<Meta> {
  const js = `(async()=>{ try { var DEALER=${JSON.stringify(dealer)}; ${HEADER_JS}
    var f = await fetch('/api/financial-statements/u/fsEntry/filter',{method:'POST',headers:H0,credentials:'include',body:JSON.stringify(['-1_'+DEALER])});
    var fj = await f.json(); var year = new Date().getFullYear();
    var cur = (fj.data.fsMappingInfoList||[]).filter(function(x){return x.year===year && x.fsType==='OEM';})[0];
    if(!cur) return 'ERR no OEM FS mapping for '+DEALER+' '+year;
    var all=[], start=0;
    while(true){ var r=await fetch('/api/accounting/u/glAccount/search',{method:'POST',headers:H0,credentials:'include',body:JSON.stringify({pageInfo:{start:start,rows:200}})});
      var j=await r.json(); var hits=j.data.hits||[]; all=all.concat(hits); start+=200; if(hits.length<200) break; }
    var coa={}; all.forEach(function(a){ coa[a.id]={n:a.accountNumber,name:a.accountName,t:a.accountTypeId,d:a.departmentType||null}; });
    var m=await fetch('/api/financial-statements/u/oemMapping/glAccountMapping/'+cur.id+'?mockMapping=false',{headers:H0,credentials:'include'}); var mj=await m.json();
    var grp={}; (mj.data||[]).forEach(function(x){ grp[x.glAccountId]=x.fsCellGroupCode; });
    var g=await fetch('/api/financial-statements/u/oemMapping/fsCellGroups/'+cur.oemId+'/'+year+'/1',{headers:H0,credentials:'include'}); var gj=await g.json();
    var groups={}; (gj.data||[]).forEach(function(x){ groups[x.groupCode]={name:x.groupDisplayName||x.lineDescription||x.groupCode, page:(parseInt(String(x.pageNumber),10)||null)}; });
    return JSON.stringify({fsId:cur.id, oem:cur.oemId, coa:coa, grp:grp, groups:groups});
  } catch(e){ return 'ERR '+String(e); } })()`;
  return evalJs(js);
}

/**
 * Tekion's `departmentType` on GL accounts is only reliably set at some stores
 * (SCT/SCVW/VWC/ARSJ tagged; BST/TOL mostly untagged; BC tagged on sales only).
 * Each OEM uses a standardized chart of accounts, so:
 *   1. inherit department by ACCOUNT NUMBER from any sibling store on the same OEM
 *      where it IS tagged (SCT → BST/TOL, SCVW → VWC);
 *   2. cost/expense accounts inherit from the SALE account with the same suffix
 *      (Toyota 4400↔6400, VW 4402↔5402, GM 460A↔660A) — leading digit differs only.
 */
function fillDepartments(metas: Record<string, Meta>) {
  const byOem: Record<string, Record<string, string>> = {};
  for (const m of Object.values(metas)) {
    const map = (byOem[m.oem] ??= {});
    for (const a of Object.values(m.coa)) if (a.d && !map[a.n]) map[a.n] = a.d;
  }
  for (const m of Object.values(metas)) {
    const map = byOem[m.oem] ?? {};
    for (const a of Object.values(m.coa)) if (!a.d && map[a.n]) a.d = map[a.n];
    const saleBySuffix: Record<string, string> = {};
    for (const a of Object.values(m.coa)) if (a.t === "SALE" && a.d && /^4/.test(a.n)) saleBySuffix[a.n.slice(1)] = a.d;
    for (const a of Object.values(m.coa)) {
      if (!a.d && (a.t === "COST_OF_SALE" || a.t === "OPERATING_EXPENSE") && /^[56]/.test(a.n)) a.d = saleBySuffix[a.n.slice(1)] ?? null;
    }
  }
}

async function fetchCells(dealer: string, fsId: string, ymd: string): Promise<Record<string, Cell>> {
  const till = eodPacific(ymd);
  const js = `(async()=>{ try { var DEALER=${JSON.stringify(dealer)}; ${HEADER_JS}
    var r=await fetch('/api/financial-statements/u/oemMapping/fsCellCodeDetails/${fsId}/till/${till}?addM13BalInDecBalances=false&hideUnusedPages=true&includeM13=true',{headers:H0,credentials:'include'});
    var j=await r.json(); if(!j.data||!j.data.codeVsDetailsMap) return 'ERR cells: '+JSON.stringify(j).slice(0,300);
    var m=j.data.codeVsDetailsMap, out={};
    Object.keys(m).forEach(function(k){ if(/_(BALANCE|COUNT)_(MTD|YTD)$/.test(k) && !m[k].derived) out[k]={value:m[k].value, glAccountDetails:m[k].glAccountDetails||[]}; });
    return JSON.stringify(out);
  } catch(e){ return 'ERR '+String(e); } })()`;
  return evalJs(js);
}

/** Supabase pooler drops idle connections during long browser fetches — retry once after reconnect. */
async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e: any) {
    if (!/closed the connection|Connection reset|ECONNRESET|P1017/i.test(String(e))) throw e;
    await prisma.$disconnect().catch(() => {}); await prisma.$connect();
    return fn();
  }
}

// DB stores the full OpenAPI id "americanmotorscorporation_826_0"; internal API wants the bare numeric.
const bareDealer = (id: string) => id.match(/_(\d+)_\d+$/)?.[1] ?? id;

async function snapshotStore(abbrev: string, dates: string[], meta: Meta) {
  const store = await prisma.store.findFirst({ where: { abbreviation: abbrev }, select: { id: true, abbreviation: true, tekionDealerId: true, apiSyncEnabled: true } });
  if (!store?.tekionDealerId) throw new Error(`Store ${abbrev} has no tekionDealerId`);
  const dealer = bareDealer(store.tekionDealerId);
  const tagged = Object.values(meta.coa).filter((a) => a.d).length;
  console.log(`[gl] ${abbrev} dealer ${dealer} fs ${meta.fsId} (${meta.oem}) coa=${Object.keys(meta.coa).length} dept-tagged=${tagged} mapped=${Object.keys(meta.grp).length}`);

  for (const ymd of dates) {
    const cells = await fetchCells(dealer, meta.fsId, ymd);
    // Per-GL MTD/YTD/count from the non-derived cells.
    const acct: Record<string, { mtd: number; ytd: number; cnt: number; grp: string | null }> = {};
    for (const [code, c] of Object.entries(cells)) {
      const mm = code.match(/^(.*)_(BALANCE|COUNT)_(MTD|YTD)$/);
      if (!mm) continue;
      const [, grpCode, kind, dur] = mm;
      for (const g of c.glAccountDetails ?? []) {
        const a = (acct[g.glAccountId] ??= { mtd: 0, ytd: 0, cnt: 0, grp: meta.grp[g.glAccountId] ?? grpCode });
        if (kind === "BALANCE" && dur === "MTD") a.mtd = g.value;
        else if (kind === "BALANCE" && dur === "YTD") a.ytd = g.value;
        else if (kind === "COUNT" && dur === "MTD") a.cnt = g.value;
      }
    }
    // previous snapshot in same month for daily delta
    const prevRows = await withDb(() => prisma.glAccountDaily.findMany({
      where: { storeId: store.id, asOfDate: { lt: new Date(ymd), gte: new Date(ymd.slice(0, 8) + "01") } },
      orderBy: { asOfDate: "desc" }, select: { asOfDate: true, glAccountId: true, mtd: true },
    }));
    const prevDate = prevRows[0]?.asOfDate?.toISOString().slice(0, 10);
    const prev: Record<string, number> = {};
    for (const r of prevRows) if (r.asOfDate.toISOString().slice(0, 10) === prevDate) prev[r.glAccountId] = r.mtd;

    const rows = Object.entries(acct)
      .filter(([id, a]) => meta.coa[id] && (a.mtd !== 0 || a.ytd !== 0 || a.cnt !== 0 || prev[id] !== undefined))
      .map(([id, a]) => {
        const c = meta.coa[id];
        return {
          storeId: store.id, asOfDate: new Date(ymd), glAccountId: id,
          accountNumber: c.n, accountName: c.name, accountType: c.t, department: c.d,
          fsGroup: a.grp, fsLine: a.grp ? meta.groups[a.grp]?.name ?? null : null, fsPage: a.grp ? meta.groups[a.grp]?.page ?? null : null,
          mtd: a.mtd, ytd: a.ytd, mtdCount: Math.round(a.cnt || 0), daily: a.mtd - (prev[id] ?? 0),
        };
      });

    await withDb(() => prisma.$transaction(async (tx) => {
      await tx.glAccountDaily.deleteMany({ where: { storeId: store.id, asOfDate: new Date(ymd) } });
      for (let i = 0; i < rows.length; i += 500) await tx.glAccountDaily.createMany({ data: rows.slice(i, i + 500) });
    }));
    const svc = rows.filter((r) => r.department === "SERVICE");
    const sales = -svc.filter((r) => r.accountType === "SALE").reduce((s, r) => s + r.mtd, 0);
    const cost = svc.filter((r) => r.accountType === "COST_OF_SALE").reduce((s, r) => s + r.mtd, 0);
    console.log(`[gl] ${abbrev} ${ymd}: ${rows.length} accts · service MTD sales ${sales.toFixed(0)} gross ${(sales - cost).toFixed(0)} (prev ${prevDate ?? "—"})`);
  }
}

async function main() {
  const [arg0, arg1, arg2] = process.argv.slice(2);
  const today = todayPacific();
  const start = arg1 ?? addDays(today, -1);
  const end = arg2 ?? (arg1 ? arg1 : today);
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

  const stores = !arg0 || arg0 === "ALL"
    ? (await prisma.store.findMany({ where: { apiSyncEnabled: true, tekionDealerId: { not: null } }, select: { abbreviation: true }, orderBy: { abbreviation: "asc" } })).map((s) => s.abbreviation!).filter(Boolean)
    : [arg0];

  // sanity: browser alive + logged in
  const alive = await evalJs(`(()=>JSON.stringify({u:location.href, tok:!!localStorage.t_token}))()`).catch((e) => { throw new Error(`persistent browser ${BROWSER} unreachable: ${e}`); });
  if (!alive.tok || !/tekioncloud\.com/.test(alive.u) || /login/i.test(alive.u)) throw new Error(`browser ${BROWSER} not logged into Tekion (${alive.u})`);

  // Always load COA for ALL API stores (even when snapshotting one) so the
  // per-OEM department map can borrow tags from sibling stores.
  const allStores = await prisma.store.findMany({ where: { apiSyncEnabled: true, tekionDealerId: { not: null } }, select: { abbreviation: true, tekionDealerId: true } });
  const metas: Record<string, Meta> = {};
  for (const s of allStores) {
    try { metas[s.abbreviation!] = await fetchStoreMeta(bareDealer(s.tekionDealerId!)); }
    catch (e) { console.error(`[gl] ${s.abbreviation} meta FAILED: ${e}`); }
  }
  fillDepartments(metas);

  const failed: string[] = [];
  for (const s of stores) {
    try {
      if (!metas[s]) throw new Error("no COA/FS metadata");
      await snapshotStore(s, dates, metas[s]);
    } catch (e) { failed.push(s); console.error(`[gl] ${s} FAILED: ${e}`); }
  }
  if (failed.length) { console.error(`[gl] failed: ${failed.join(", ")}`); process.exitCode = 1; }
}

main().finally(() => prisma.$disconnect());
