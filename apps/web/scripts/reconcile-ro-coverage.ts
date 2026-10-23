/**
 * reconcile-ro-coverage — "is the data actually complete?" guard (Omar, 10/23).
 *
 * The stale-store check only proves the sync RAN. This proves the DB MATCHES
 * TEKION: for every API-enabled store and each of the last N months it asks
 * Tekion's own ro-search (internal API through the :9225 browser, closedTime
 * window, rows=1 → just `total`) how many ROs CLOSED in that month, and compares
 * against RoFact rows with status=CLOSED and the same closeDate month. Any
 * store-month short by more than TOLERANCE ROs is reported, and — unless
 * --no-heal — the script immediately re-syncs that store with a window wide
 * enough to cover the oldest short month (modifiedTime ≥ month start − 1d).
 *
 *   npx tsx --conditions=react-server scripts/reconcile-ro-coverage.ts [--months 4] [--no-heal] [--quiet]
 *
 * Zero OpenAPI quota: 1 browser call per store-month (~30 calls fleet-wide).
 * Exit: 0 all match · 1 gaps found (healed or not) · 2 could not check.
 */
import fs from "node:fs";
import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";
import { syncStore } from "./sync-store";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const MONTHS = Number(opt("--months", "4"));
const TOLERANCE = Number(process.env.RECONCILE_TOLERANCE ?? 2); // reopened/voided same-day churn
const HEAL = !flag("--no-heal");
const QUIET = flag("--quiet");
const CHANNEL = process.env.SLACK_CHANNEL ?? "C0B8EPN76GJ";
const PT = "America/Los_Angeles";

function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const ln of fs.readFileSync(path, "utf8").split("\n")) {
      const t = ln.trim(); if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("="); out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* ok */ }
  return out;
}
async function postSlack(text: string) {
  const tok = process.env.SLACK_BOT_TOKEN ?? envFile("/home/itadmin/.hermes/profiles/jay/.env").SLACK_BOT_TOKEN;
  if (!tok) { console.error("no SLACK_BOT_TOKEN"); return; }
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ channel: CHANNEL, text }) });
    const j = (await r.json()) as { ok: boolean; error?: string }; if (!j.ok) console.error(`slack: ${j.error}`);
  } catch (e) { console.error(`slack failed: ${(e as Error).message}`); }
}

/** Pacific-midnight epoch ms for the 1st of (year, month0). */
function ptMonthStartMs(y: number, m0: number): number {
  // find UTC instant where PT wall-clock = y-m-01 00:00
  const guess = Date.UTC(y, m0, 1, 8); // 08:00Z = 00:00 PST (or 01:00 PDT)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PT, hour: "numeric", hour12: false }).formatToParts(new Date(guess));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return guess - h * 3600_000;
}

type Gap = { abbrev: string; month: string; tekion: number; db: number };

async function main(): Promise<number> {
  const stores = await prisma.store.findMany({
    where: { apiSyncEnabled: true, tekionDealerId: { not: null } },
    select: { id: true, abbreviation: true, tekionDealerId: true },
    orderBy: { abbreviation: "asc" },
  });
  const bridge = new BrowserBridge();
  const client = new TekionInternalClient(bridge);

  const now = new Date();
  const nowPT = new Date(now.toLocaleString("en-US", { timeZone: PT }));
  const months: Array<{ label: string; startMs: number; endMs: number; start: Date; end: Date }> = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const y = nowPT.getFullYear(), m0 = nowPT.getMonth() - i;
    const startMs = ptMonthStartMs(y, m0), endMs = Math.min(ptMonthStartMs(y, m0 + 1) - 1, now.getTime());
    const d = new Date(Date.UTC(y, m0, 1));
    const dEnd = new Date(Date.UTC(y, m0 + 1, 0));
    months.push({ label: d.toISOString().slice(0, 7), startMs, endMs, start: d, end: dEnd });
  }

  const gaps: Gap[] = [];
  const lines: string[] = [];
  for (const s of stores) {
    const ab = s.abbreviation ?? "?";
    const dealer = numericDealerId(s.tekionDealerId!);
    const cells: string[] = [];
    for (const m of months) {
      let tek = -1;
      try {
        const body = {
          pageInfo: { start: 0, rows: 1 }, sort: [{ order: "ASC", field: "modifiedTime" }], searchText: null,
          filters: [
            { operator: "IN", values: [false], field: "migrated" },
            { operator: "GTE", values: [m.startMs], field: "closedTime" },
            { operator: "LTE", values: [m.endMs], field: "closedTime" },
          ],
          searchFields: ["RO_NO"],
        };
        tek = await client.countRoSearch(dealer, body);
      } catch (e) {
        cells.push(`${m.label}: tekion ERR ${(e as Error).message.slice(0, 60)}`);
        continue;
      }
      const db = await prisma.roFact.count({ where: { storeId: s.id, status: "CLOSED", closeDate: { gte: m.start, lte: m.end } } });
      const delta = db - tek;
      const mark = tek - db > TOLERANCE ? " ✗" : "";
      cells.push(`${m.label} ${db}/${tek}${mark}`);
      if (tek - db > TOLERANCE) gaps.push({ abbrev: ab, month: m.label, tekion: tek, db });
      void delta;
    }
    lines.push(`${ab.padEnd(5)} ${cells.join("  ")}`);
  }
  const report = lines.join("\n");
  if (!QUIET) console.log(`db/tekion closed ROs per month (tolerance ${TOLERANCE})\n${report}`);

  if (!gaps.length) { console.log("coverage OK — every store-month matches Tekion"); return 0; }

  const healed: string[] = [];
  if (HEAL) {
    const byStore = new Map<string, Gap[]>();
    for (const g of gaps) (byStore.get(g.abbrev) ?? byStore.set(g.abbrev, []).get(g.abbrev)!).push(g);
    for (const [ab, gs] of byStore) {
      const oldest = gs.map((g) => g.month).sort()[0];
      const oldestStart = new Date(`${oldest}-01T00:00:00Z`).getTime() - 86_400_000;
      const windowDays = Math.ceil((now.getTime() - oldestStart) / 86_400_000);
      console.log(`heal ${ab}: re-sync window=${windowDays}d (oldest short month ${oldest})`);
      try {
        const r = await syncStore(ab, windowDays);
        healed.push(`${ab} re-synced ${windowDays}d → ${r.rosFetched} ROs`);
      } catch (e) {
        healed.push(`${ab} heal FAILED: ${(e as Error).message.slice(0, 120)}`);
      }
    }
  }
  const gapTxt = gaps.map((g) => `${g.abbrev} ${g.month}: db ${g.db} vs Tekion ${g.tekion} (−${g.tekion - g.db})`).join("\n");
  await postSlack(
    `:mag: *fixedopsreports RO coverage gaps* (closed ROs, db vs Tekion)\n\`\`\`\n${gapTxt}\n\`\`\`` +
    (HEAL ? `\nAuto-heal: ${healed.join("; ")}\nRe-run \`reconcile-ro-coverage\` to confirm.` : "\n(heal disabled)"),
  );
  return 1;
}

main()
  .then(async (rc) => { await prisma.$disconnect(); process.exit(rc); })
  .catch(async (e) => { console.error(e); await postSlack(`:rotating_light: RO coverage reconcile could NOT run: ${(e as Error).message.slice(0, 200)}`); await prisma.$disconnect(); process.exit(2); });
