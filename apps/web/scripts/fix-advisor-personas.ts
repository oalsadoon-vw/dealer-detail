/**
 * One-off / repeatable: re-resolve persona for every Advisor row whose persona
 * is NOT SERVICE_ADVISOR (or is null) using the internal user endpoint, which
 * exposes secondary roles. Fixes advisors filed under "Others" because their
 * primary Tekion role is a generic "Employee" (T9 §7).
 *
 *   npx tsx --conditions=react-server scripts/fix-advisor-personas.ts [ABBREV|ALL] [--dry]
 */
import { prisma } from "../lib/db";
import { BrowserBridge } from "../lib/sources/tekion/internal/browser";
import { TekionInternalClient } from "../lib/sources/tekion/internal/client";
import { numericDealerId } from "../lib/sources/tekion/internal/collector";

async function main() {
  const abbrev = (process.argv[2] ?? "ALL").toUpperCase();
  const dry = process.argv.includes("--dry");
  const bridge = new BrowserBridge();
  await bridge.assertAuthenticated();
  const client = new TekionInternalClient(bridge);

  const stores = await prisma.store.findMany({
    where: { apiSyncEnabled: true, tekionDealerId: { not: null }, ...(abbrev === "ALL" ? {} : { abbreviation: abbrev }) },
    select: { id: true, abbreviation: true, tekionDealerId: true },
  });
  let changed = 0, checked = 0, failed = 0;
  for (const s of stores) {
    const dealer = numericDealerId(s.tekionDealerId!);
    const advisors = await prisma.advisor.findMany({
      where: { storeId: s.id, tekionUserId: { not: null }, OR: [{ persona: null }, { persona: { not: "SERVICE_ADVISOR" } }] },
      select: { id: true, nameRaw: true, persona: true, tekionUserId: true },
    });
    for (const a of advisors) {
      checked++;
      try {
        const u = await client.getUser(dealer, a.tekionUserId!);
        if (u.persona && u.persona !== a.persona) {
          console.log(`${s.abbreviation} ${a.nameRaw ?? a.id}: ${a.persona ?? "null"} → ${u.persona}  [${u.personas.join(",")}]`);
          changed++;
          if (!dry) await prisma.advisor.update({ where: { id: a.id }, data: { persona: u.persona } });
        }
      } catch (err) {
        failed++;
        console.warn(`${s.abbreviation} ${a.nameRaw ?? a.id}: lookup failed — ${(err as Error).message}`);
      }
    }
  }
  console.log(`\nchecked=${checked} changed=${changed} failed=${failed}${dry ? " (dry run)" : ""}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
