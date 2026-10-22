/**
 * check-stale-stores — DealerDetail freshness guard (T9 §8).
 *
 * Runs every morning after the nightly sync. For each API-enabled store, reads
 * the newest RawRepairOrder.fetchedAt and the latest SyncRun. If ANY store is
 * older than STALE_HOURS (default 30h = one missed night) OR the latest run
 * failed because the :9225 browser was logged out, posts ONE Slack message.
 * Silent when everything is current. Slack failure never throws — the cron
 * log is the fallback.
 *
 *   npx tsx --conditions=react-server scripts/check-stale-stores.ts
 *
 * Env: STALE_HOURS (30), SLACK_CHANNEL (C0B8EPN76GJ), SLACK_BOT_TOKEN
 *      (falls back to /home/itadmin/.hermes/profiles/jay/.env).
 * Exit: 0 fresh · 1 alert raised · 2 could not check.
 */
import fs from "node:fs";
import { prisma } from "../lib/db";

const STALE_HOURS = Number(process.env.STALE_HOURS ?? 30);
const CHANNEL = process.env.SLACK_CHANNEL ?? "C0B8EPN76GJ";

function envFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const ln of fs.readFileSync(path, "utf8").split("\n")) {
      const t = ln.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* missing file is fine */ }
  return out;
}

async function postSlack(text: string): Promise<boolean> {
  const tok = process.env.SLACK_BOT_TOKEN ?? envFile("/home/itadmin/.hermes/profiles/jay/.env").SLACK_BOT_TOKEN;
  if (!tok) { console.error("no SLACK_BOT_TOKEN — alert NOT posted"); return false; }
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel: CHANNEL, text }),
    });
    const j = (await r.json()) as { ok: boolean; error?: string };
    if (!j.ok) console.error(`slack error: ${j.error}`);
    return j.ok;
  } catch (e) {
    console.error(`slack post failed: ${(e as Error).message}`);
    return false;
  }
}

const fmtPT = (d: Date | null) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "never";

async function main(): Promise<number> {
  let stores;
  try {
    stores = await prisma.store.findMany({
      where: { apiSyncEnabled: true, tekionDealerId: { not: null } },
      select: { id: true, abbreviation: true },
      orderBy: { abbreviation: "asc" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`check failed: ${msg}`);
    await postSlack(`:rotating_light: fixedopsreports freshness check could NOT run: ${msg}`);
    return 2;
  }

  const now = Date.now();
  const stale: string[] = [], auth: string[] = [], lines: string[] = [];
  for (const s of stores) {
    const [wm, run] = await Promise.all([
      prisma.rawRepairOrder.aggregate({ where: { storeId: s.id }, _max: { fetchedAt: true } }),
      prisma.syncRun.findFirst({ where: { storeId: s.id }, orderBy: { startedAt: "desc" }, select: { status: true, summary: true } }),
    ]);
    const last = wm._max.fetchedAt;
    const age = last ? (now - last.getTime()) / 36e5 : Infinity;
    const sm = (run?.summary ?? {}) as { source?: string; authFailed?: boolean };
    let flag = "";
    if (sm.authFailed) { auth.push(s.abbreviation ?? "?"); flag = "  ← browser logged out"; }
    else if (age > STALE_HOURS) { stale.push(s.abbreviation ?? "?"); flag = "  ← STALE"; }
    lines.push(`${(s.abbreviation ?? "?").padEnd(5)} last RO fetch ${fmtPT(last)} (${Number.isFinite(age) ? Math.round(age) : "∞"}h)  run=${run?.status ?? "—"}/${sm.source ?? "openapi"}${flag}`);
  }
  const report = lines.join("\n");
  console.log(report);
  if (!stale.length && !auth.length) { console.log(`all ${stores.length} stores fresh (<${STALE_HOURS}h)`); return 0; }

  let head = ":warning: *fixedopsreports.com data is STALE*";
  if (auth.length) head += `\n:9225 browser is logged out of Tekion → nightly sync skipped for: ${auth.join(", ")}. Re-auth the browser, then run \`bash /home/itadmin/dealer-detail/scripts/cron-ro-sync-internal.sh\`.`;
  if (stale.length) head += `\nStores older than ${STALE_HOURS}h: ${stale.join(", ")}.`;
  await postSlack(`${head}\n\`\`\`\n${report}\n\`\`\``);
  return 1;
}

main()
  .then(async (rc) => { await prisma.$disconnect(); process.exit(rc); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(2); });
