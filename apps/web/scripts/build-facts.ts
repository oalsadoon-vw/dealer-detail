/**
 * Rebuild RoFact/RoOpFact fact tables from RawRepairOrder payloads.
 *
 *   npm run facts:build -- SCVW            # one store, every raw RO
 *   npm run facts:build -- ALL             # all API stores
 *   npm run facts:build -- SCT 2026-09-01  # only raw rows fetched since date
 */
import { prisma } from "../lib/db";
import { buildRoFacts } from "../lib/facts/buildRoFacts";

async function main() {
  const abbrevArg = (process.argv[2] ?? "ALL").toUpperCase();
  const since = process.argv[3] ? new Date(process.argv[3]) : undefined;

  const stores = await prisma.store.findMany({
    where: abbrevArg === "ALL" ? { apiSyncEnabled: true } : { abbreviation: abbrevArg },
    select: { id: true, abbreviation: true, name: true },
    orderBy: { abbreviation: "asc" },
  });
  if (stores.length === 0) throw new Error(`No store(s) for '${abbrevArg}'`);

  for (const s of stores) {
    const t0 = Date.now();
    const res = await buildRoFacts({
      storeId: s.id,
      fetchedSince: since,
      log: (m) => console.log(`  ${m}`),
    });
    console.log(
      `${s.abbreviation}: ros=${res.rosBuilt} ops=${res.opsBuilt} skipped=${res.skipped} unclassified=${res.unclassifiedOpcodes.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
