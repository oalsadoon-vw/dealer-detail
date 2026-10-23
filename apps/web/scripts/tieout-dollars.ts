/**
 * tieout-dollars — site (DB, closed basis) vs Tekion's own per-RO totals.
 *
 * For each API store and a PT date range it pages Tekion ro-search
 * (status=CLOSED, closedTime in range) through the :9225 browser, sums the
 * header paySplitTotalsV3 labor/parts (cents → $), and compares against
 * RoFact (status=CLOSED, closeDate in range) laborSale/partsSale sums — the
 * exact numbers the site's Closed-basis reports show.
 *
 *   npx tsx --conditions=react-server scripts/tieout-dollars.ts [--from 2026-10-01] [--to 2026-10-21] [--stores SCT,TOL] [--slack]
 *
 * Exit 0 = every store within $TOLERANCE on both labor and parts, 1 = drift, 2 = could not run.
 */
import fs from "node:fs";
import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient, type InternalRoHeader } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PT = "America/Los_Angeles";
const TOLERANCE = Number(process.env.TIEOUT_TOLERANCE ?? 100);
const CHANNEL = process.env.SLACK_CHANNEL ?? "C0B8EPN76GJ";
const ROWS = 200;

function ptYmdNow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
/** epoch ms of PT midnight for YYYY-MM-DD */
function ptMidnightMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 8);
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: PT, hour: "numeric", hour12: false }).formatToParts(new Date(guess)).find((p) => p.type === "hour")?.value ?? 0) % 24;
  return guess - h * 3600_000;
}
function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try { for (const ln of fs.readFileSync(path, "utf8").split("\n")) { const t = ln.trim(); if (!t || t.startsWith("#") || !t.includes("=")) continue; const i = t.indexOf("="); out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, ""); } } catch { /* ok */ }
  return out;
}
async function postSlack(text: string) {
  const tok = process.env.SLACK_BOT_TOKEN ?? envFile("/home/itadmin/.hermes/profiles/jay/.env").SLACK_BOT_TOKEN;
  if (!tok) return;
  try { await fetch("https://slack.com/api/chat.postMessage", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ channel: CHANNEL, text }) }); } catch { /* ok */ }
}

type Totals = { ros: number; labor: number; parts: number };
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function splitTotals(h: InternalRoHeader): { labor: number; parts: number } {
  // paySplitTotalsV3: { cpAmounts: { laborAmount, partsAmount, ... }, wpAmounts: {...}, ipAmounts: {...} } — cents
  const ps = (h.paySplitTotalsV3 ?? {}) as Record<string, Record<string, unknown>>;
  let labor = 0, parts = 0;
  for (const v of Object.values(ps)) {
    if (!v || typeof v !== "object") continue;
    labor += Number((v as Record<string, unknown>).laborAmount ?? 0);
    parts += Number((v as Record<string, unknown>).partsAmount ?? 0);
  }
  return { labor: labor / 100, parts: parts / 100 };
}

async function tekionTotals(client: TekionInternalClient, dealer: string, fromMs: number, toMs: number): Promise<Totals> {
  const t: Totals = { ros: 0, labor: 0, parts: 0 };
  const seen = new Set<string>();
  for (let start = 0; ; start += ROWS) {
    const body = {
      pageInfo: { start, rows: ROWS }, sort: [{ order: "ASC", field: "closedTime" }], searchText: null,
      filters: [
        { operator: "IN", values: [false], field: "migrated" },
        { operator: "IN", values: ["CLOSED"], field: "status" },
        { operator: "GTE", values: [fromMs], field: "closedTime" },
        { operator: "LTE", values: [toMs], field: "closedTime" },
      ],
      searchFields: ["RO_NO"],
    };
    const r = await client.rawRoSearch(dealer, body);
    for (const h of r.list) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      const s = splitTotals(h);
      t.ros++; t.labor += s.labor; t.parts += s.parts;
    }
    if (r.list.length < ROWS || start + ROWS >= r.total) break;
  }
  return t;
}

async function main(): Promise<number> {
  const to = opt("--to", ptYmdNow());
  const from = opt("--from", `${to.slice(0, 7)}-01`);
  const only = opt("--stores", "").split(",").map((s) => s.trim()).filter(Boolean);
  const fromMs = ptMidnightMs(from);
  const toMs = ptMidnightMs(to) + 86_400_000 - 1;
  const gte = new Date(`${from}T00:00:00Z`), lte = new Date(`${to}T00:00:00Z`);

  const stores = await prisma.store.findMany({
    where: { apiSyncEnabled: true, tekionDealerId: { not: null }, ...(only.length ? { abbreviation: { in: only } } : {}) },
    select: { id: true, abbreviation: true, tekionDealerId: true }, orderBy: { abbreviation: "asc" },
  });
  const client = new TekionInternalClient(new BrowserBridge());

  const rows: string[] = [];
  const drift: string[] = [];
  rows.push(`${"store".padEnd(5)} ${"ROs db/tek".padEnd(12)} ${"labor site".padStart(11)} ${"labor tek".padStart(11)} ${"Δ".padStart(9)} ${"parts site".padStart(11)} ${"parts tek".padStart(11)} ${"Δ".padStart(9)}  verdict`);
  for (const s of stores) {
    const ab = s.abbreviation ?? "?";
    const dealer = numericDealerId(s.tekionDealerId!);
    let tek: Totals;
    try { tek = await tekionTotals(client, dealer, fromMs, toMs); }
    catch (e) { rows.push(`${ab.padEnd(5)} tekion ERR ${(e as Error).message.slice(0, 80)}`); drift.push(`${ab}: could not read Tekion`); continue; }
    const agg = await prisma.roFact.aggregate({
      where: { storeId: s.id, status: "CLOSED", closeDate: { gte, lte } },
      _count: { _all: true }, _sum: { laborSale: true, partsSale: true },
    });
    const site: Totals = { ros: agg._count._all, labor: agg._sum.laborSale ?? 0, parts: agg._sum.partsSale ?? 0 };
    const dl = site.labor - tek.labor, dp = site.parts - tek.parts;
    const ok = Math.abs(dl) <= TOLERANCE && Math.abs(dp) <= TOLERANCE;
    const verdict = ok ? "TIES" : `DRIFT (${site.ros < tek.ros ? `${tek.ros - site.ros} ROs missing` : site.ros > tek.ros ? `${site.ros - tek.ros} extra ROs` : "same count, $ differ"})`;
    rows.push(`${ab.padEnd(5)} ${`${site.ros}/${tek.ros}`.padEnd(12)} ${money(site.labor).padStart(11)} ${money(tek.labor).padStart(11)} ${money(dl).padStart(9)} ${money(site.parts).padStart(11)} ${money(tek.parts).padStart(11)} ${money(dp).padStart(9)}  ${verdict}`);
    if (!ok) drift.push(`${ab}: labor Δ$${money(dl)}, parts Δ$${money(dp)}, ROs ${site.ros}/${tek.ros}`);
  }
  const table = rows.join("\n");
  console.log(`site(closed basis, status=CLOSED) vs Tekion paySplitTotalsV3, ${from}..${to} PT, tolerance $${TOLERANCE}\n${table}`);
  if (flag("--slack")) {
    await postSlack(drift.length
      ? `:warning: *fixedopsreports $ tie-out ${from}..${to}* — ${drift.length} store(s) drift >$${TOLERANCE}\n\`\`\`\n${table}\n\`\`\``
      : `:white_check_mark: *fixedopsreports $ tie-out ${from}..${to}* — all stores tie within $${TOLERANCE}\n\`\`\`\n${table}\n\`\`\``);
  }
  return drift.length ? 1 : 0;
}

main().then(async (rc) => { await prisma.$disconnect(); process.exit(rc); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(2); });
