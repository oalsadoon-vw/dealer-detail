/**
 * Seed / upsert the 7 AMG stores with their Tekion dealer IDs and enable
 * API sync on all of them. Idempotent — safe to re-run.
 *
 * - Existing stores (SCT, SCVW, ARSJ) are matched by abbreviation and
 *   UPDATED in place (never duplicated — see the duplicate-store trap in
 *   docs/PILOT_STATE.md / consolidate-st-store.ts history).
 * - Missing stores (BST, BC, TOL, VWC) are created under the AMG org.
 *
 * Run: npm run seed:stores
 */

import { prisma } from "../lib/db";

const AMG_ORG_NAME = "AMERICAN MOTORS GROUP";
const TZ = "America/Los_Angeles";

type StoreSeed = {
  abbreviation: string;
  name: string;
  tekionDealerId: string;
  /** legacy abbreviations that may exist in the DB for the same store */
  aliases?: string[];
};

const STORES: StoreSeed[] = [
  { abbreviation: "SCT",  name: "Stevens Creek Toyota",           tekionDealerId: "americanmotorscorporation_876_0" },
  { abbreviation: "SCVW", name: "Stevens Creek Volkswagen",       tekionDealerId: "americanmotorscorporation_826_0" },
  { abbreviation: "ARSJ", name: "Alfa Romeo of San Jose",         tekionDealerId: "americanmotorscorporation_6195_0" },
  { abbreviation: "BST",  name: "Blackstone Toyota",              tekionDealerId: "americanmotorscorporation_1249_0", aliases: ["BT"] },
  { abbreviation: "BC",   name: "Blackstone Chevrolet Cadillac",  tekionDealerId: "americanmotorscorporation_1251_0" },
  { abbreviation: "TOL",  name: "Toyota of Lancaster",            tekionDealerId: "americanmotorscorporation_1092_0", aliases: ["TL"] },
  { abbreviation: "VWC",  name: "Volkswagen Clovis",              tekionDealerId: "americanmotorscorporation_1891_0", aliases: ["VC"] },
];

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: AMG_ORG_NAME },
    select: { id: true, name: true },
  });
  if (!org) throw new Error(`Organization "${AMG_ORG_NAME}" not found — refusing to guess.`);
  console.log(`org: ${org.name} (${org.id})\n`);

  for (const s of STORES) {
    // Guard: dealerId must not already be claimed by a DIFFERENT store.
    const claimed = await prisma.store.findFirst({
      where: { tekionDealerId: s.tekionDealerId, NOT: { abbreviation: { in: [s.abbreviation, ...(s.aliases ?? [])] } } },
      select: { id: true, abbreviation: true, name: true },
    });
    if (claimed) {
      throw new Error(
        `tekionDealerId ${s.tekionDealerId} already on store ${claimed.abbreviation} (${claimed.id}) — resolve manually.`,
      );
    }

    const existing = await prisma.store.findFirst({
      where: {
        organizationId: org.id,
        abbreviation: { in: [s.abbreviation, ...(s.aliases ?? [])] },
      },
      select: { id: true, abbreviation: true, name: true, tekionDealerId: true, apiSyncEnabled: true },
    });

    if (existing) {
      await prisma.store.update({
        where: { id: existing.id },
        data: {
          tekionDealerId: s.tekionDealerId,
          apiSyncEnabled: true,
        },
      });
      console.log(
        `UPDATED  ${s.abbreviation.padEnd(5)} ${existing.id}  (was: dealerId=${existing.tekionDealerId ?? "null"}, apiSync=${existing.apiSyncEnabled})`,
      );
    } else {
      const created = await prisma.store.create({
        data: {
          organizationId: org.id,
          name: s.name,
          abbreviation: s.abbreviation,
          timezone: TZ,
          tekionDealerId: s.tekionDealerId,
          apiSyncEnabled: true,
        },
        select: { id: true },
      });
      console.log(`CREATED  ${s.abbreviation.padEnd(5)} ${created.id}`);
    }
  }

  console.log("\n=== FINAL STORE STATE ===");
  const all = await prisma.store.findMany({
    where: { organizationId: org.id },
    select: { abbreviation: true, name: true, tekionDealerId: true, apiSyncEnabled: true },
    orderBy: { abbreviation: "asc" },
  });
  for (const st of all) {
    console.log(
      `${(st.abbreviation ?? "?").padEnd(5)} apiSync=${String(st.apiSyncEnabled).padEnd(5)} dealer=${st.tekionDealerId ?? "(none)"}  ${st.name}`,
    );
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error("seed-amg-stores FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
