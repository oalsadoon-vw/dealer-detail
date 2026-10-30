/**
 * backfill-first-close — one-time D10 backfill for RoFact.firstCloseDate.
 *
 *   1. firstCloseDate = closeDate wherever it is still NULL (every RO that ever
 *      closed keeps its current close date as the original).
 *   2. For CLOSED rows whose payload ro.invoicedTime is >7 days before
 *      ro.closedTime AND in an earlier calendar month (store timezone, Pacific
 *      by default), Tekion overwrote closedTime on a re-close — set
 *      firstCloseDate = invoicedTime::date (Pacific midnight UTC convention,
 *      same as buildRoFacts.closeDate) and wasReclosed = true.
 *
 * Supports --dry-run (no writes), --stores CSV filter (by abbreviation).
 * Jay runs this against the database; DO NOT run it here.
 *
 *   npx tsx --conditions=react-server scripts/backfill-first-close.ts [--dry-run] [--stores SCT,TOL]
 */
import { prisma } from "../lib/db";
import { localBusinessDate } from "../lib/facts/buildRoFacts";

const DEFAULT_TZ = "America/Los_Angeles";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = (args[args.indexOf("--stores") + 1] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main(): Promise<void> {
  // ---- pass 1: firstCloseDate = closeDate where NULL -----------------------
  const nullCount = await prisma.roFact.count({
    where: { firstCloseDate: null, closeDate: { not: null } },
  });
  console.log(`pass 1: RoFact rows with firstCloseDate NULL and closeDate set: ${nullCount}`);
  if (!dryRun && nullCount > 0) {
    const n = await prisma.$executeRawUnsafe(
      `UPDATE "RoFact" SET "firstCloseDate" = "closeDate" WHERE "firstCloseDate" IS NULL AND "closeDate" IS NOT NULL`,
    );
    console.log(`pass 1: updated ${n} rows`);
  }

  // ---- pass 2: re-closed detection ----------------------------------------
  const stores = await prisma.store.findMany({
    where: only.length ? { abbreviation: { in: only } } : {},
    select: { id: true, abbreviation: true, timezone: true },
    orderBy: { abbreviation: "asc" },
  });

  let totalCandidates = 0;
  let totalUpdated = 0;
  for (const s of stores) {
    const tz = s.timezone || DEFAULT_TZ;
    const closedRows = await prisma.roFact.findMany({
      where: { storeId: s.id, status: "CLOSED", closeDate: { not: null }, ...(dryRun ? {} : {}) },
      select: { id: true, documentId: true, documentNumber: true, firstCloseDate: true, closeDate: true, laborSale: true, partsSale: true },
    });
    if (closedRows.length === 0) continue;
    const raw = await prisma.rawRepairOrder.findMany({
      where: { storeId: s.id, documentId: { in: closedRows.map((r) => r.documentId) } },
      select: { documentId: true, payload: true },
    });
    const payloadByDoc = new Map(raw.map((r) => [r.documentId, r.payload as any]));
    const toUpdate: Array<{ id: string; firstCloseDate: Date }> = [];
    for (const row of closedRows) {
      const ro = payloadByDoc.get(row.documentId)?.ro;
      const invoiced = num(ro?.invoicedTime);
      const closed = num(ro?.closedTime);
      if (invoiced == null || closed == null) continue;
      const sevenDays = 7 * 86_400_000;
      if (invoiced >= closed - sevenDays) continue;
      if (monthOf(invoiced, tz) >= monthOf(closed, tz)) continue;
      totalCandidates++;
      totalUpdated++;
      toUpdate.push({ id: row.id, firstCloseDate: localBusinessDate(invoiced, tz) });
      console.log(
        `  reclosed  ${s.abbreviation ?? "?"} ${row.documentNumber}  close=${row.closeDate?.toISOString().slice(0, 10)} invoiced=${new Date(invoiced).toISOString().slice(0, 10)} → firstClose=${localBusinessDate(invoiced, tz).toISOString().slice(0, 10)}  (labor $${money(row.laborSale)} parts $${money(row.partsSale)})`,
      );
    }
    if (!dryRun && toUpdate.length) {
      // one update per row is fine for the ~tens of rows this targets
      for (const u of toUpdate) {
        await prisma.roFact.update({
          where: { id: u.id },
          data: { firstCloseDate: u.firstCloseDate, wasReclosed: true },
        });
      }
    }
  }
  console.log(`pass 2: re-closed candidates ${totalCandidates}${dryRun ? " (dry-run — no writes)" : ""}`);
  console.log(dryRun ? "DRY-RUN: no rows modified." : `done — ${totalUpdated} re-closed rows updated (plus pass 1 honors).`);
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function monthOf(ms: number, tz: string): string {
  return localBusinessDate(ms, tz).toISOString().slice(0, 7);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });