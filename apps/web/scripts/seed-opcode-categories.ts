/**
 * Seed the GLOBAL OpcodeCategory taxonomy (storeId NULL = applies to every
 * store unless a store-specific override exists).
 *
 * Run with:
 *   set -a && . ./.env && set +a && \
 *     npx tsx --conditions=react-server scripts/seed-opcode-categories.ts
 *   # or: npm run seed:opcodes
 *
 * Idempotent: upsert by (storeId, opcode). Reruns leave row count stable.
 * This is a starter Toyota taxonomy — Joe will extend/refine. The aggregator
 * prints the unclassified-opcode list each run so missing mappings are visible.
 */

import { prisma } from "../lib/db";

type Category = "MENU" | "ALA" | "REC" | "COMMODITY";
type Seed = { opcode: string; category: Category; commodityKey?: string | null };

// PREPAID maintenance (factory prepaid/contract plans: ToyotaCare TSC/TAC,
// Toyota Xtra Care TXM, VW CareFree 10KCF/20KCF). These were previously seeded
// as MENU, which inflated menu penetration ~15x vs the strict factory-menu
// definition Joe's scorecards use (SERVICE_MENU opcodes only, 2026-07-08).
// They now land in the commodity mix under their own "prepaid_maint" line so
// nothing disappears from the dashboard.
const PREPAID_EXPLICIT: string[] = [
  "TSC10",
  "TSC5",
  "TSCCONTRACT",
  "TXM5",
  "TXM10",
  "TXM15",
  "TXM20",
  "TXM25",
  "TXMBASIC",
  "TXMPLUS",
  "TXM35KMIRAI",
  "TXM10KMIRAI",
  "TXM15K86",
  "TAC10",
  "TAC30",
  "TAC35",
  "TAC40",
  "TAC45",
  "TAC50",
  "TAC55",
  "TAC60",
  "TAC70",
  "10KCF",
  "20KCF",
];

// Store-specific MENU overrides: genuine SERVICE_MENU opcodes (verified in
// each store's Tekion opcode catalog) that do NOT match the TEK regex. Scoped
// to the store because the names are generic enough to collide elsewhere.
const MENU_STORE_SPECIFIC: Array<{ storeAbbrev: string; opcodes: string[] }> = [
  {
    storeAbbrev: "VWC",
    opcodes: [
      "INTER",
      "INTERP",
      "INTERV",
      "MAJOR",
      "MAJORP",
      "MAJORV",
      "MINOR",
      "MINORP",
      "MINORV",
    ],
  },
  { storeAbbrev: "BST", opcodes: ["5KTEST"] },
];
// NOTE: factory TEK menu packages (TEK15000BNM etc.) are handled by the
// brand-agnostic pattern fallback in opcodeClassifier.ts — do not list the
// 212 TEK*NM codes here.
//
// MENU_EXPLICIT is now EMPTY by design: the strict definition (Joe, 2026-07-08)
// is "menu = Tekion SERVICE_MENU opcodes only", which the TEK regex plus
// MENU_STORE_SPECIFIC fully covers. Prepaid plans moved to PREPAID_EXPLICIT.
const MENU_EXPLICIT: string[] = [];

// Explicit COMMODITY codes -> commodity bucket.
const COMMODITY_EXPLICIT: Array<{ opcode: string; commodityKey: string }> = [
  { opcode: "ROTATE", commodityKey: "tires" },
  { opcode: "ROTATE00RBA", commodityKey: "tires" },
  { opcode: "1TIRE", commodityKey: "tires" },
  { opcode: "2TIRE", commodityKey: "tires" },
  { opcode: "4TIRE", commodityKey: "tires" },
  { opcode: "FLAT", commodityKey: "tires" },
  { opcode: "TPMS", commodityKey: "tires" },
  { opcode: "ALIGN", commodityKey: "alignment" },
  { opcode: "FACBRAKE", commodityKey: "brakes" },
  { opcode: "ADBRAKE", commodityKey: "brakes" },
  { opcode: "BATT", commodityKey: "battery" },
  { opcode: "WIPER", commodityKey: "wipers" },
];

// Explicit ALA codes (à la carte customer-pay non-menu service ops).
// BG* = BG Products add-on services (fluid exchanges etc.) — customer-pay ALA.
const ALA_EXPLICIT: string[] = [
  "VAC",
  "MPVI",
  "MISC",
  "EARLYBIRD",
  "DIAG",
  "LOF",
  "AIR",
  "UCMPVI",
  "BATTDIAG",
  "BGCVTF",
  "BGATFX",
  "BGBFX",
  "BGCFX",
  "BGBAT",
  "BGRDIFF",
  "BFXP",
  "RACF",
  "RAF",
];

function buildSeeds(): Seed[] {
  const seeds: Seed[] = [];
  for (const opcode of MENU_EXPLICIT) {
    seeds.push({ opcode, category: "MENU", commodityKey: null });
  }
  // Prepaid maintenance rides the COMMODITY category under its own key —
  // no schema change, and it renders as a "prepaid_maint" line in the
  // commodity mix instead of inflating menu penetration.
  for (const opcode of PREPAID_EXPLICIT) {
    seeds.push({ opcode, category: "COMMODITY", commodityKey: "prepaid_maint" });
  }
  for (const { opcode, commodityKey } of COMMODITY_EXPLICIT) {
    seeds.push({ opcode, category: "COMMODITY", commodityKey });
  }
  for (const opcode of ALA_EXPLICIT) {
    seeds.push({ opcode, category: "ALA", commodityKey: null });
  }
  return seeds;
}

async function main() {
  const seeds = buildSeeds();
  console.log(`Seeding ${seeds.length} global OpcodeCategory rows...`);

  // Upsert by (storeId NULL, opcode). Prisma's nullable composite unique requires
  // findFirst+create/update pattern (NULL doesn't match in unique tuples).
  let inserted = 0;
  let updated = 0;
  for (const s of seeds) {
    const opcode = s.opcode.toUpperCase().trim();
    const existing = await prisma.opcodeCategory.findFirst({
      where: { storeId: null, opcode },
      select: { id: true, category: true, commodityKey: true },
    });
    if (existing) {
      if (
        existing.category !== s.category ||
        (existing.commodityKey ?? null) !== (s.commodityKey ?? null)
      ) {
        await prisma.opcodeCategory.update({
          where: { id: existing.id },
          data: { category: s.category, commodityKey: s.commodityKey ?? null },
        });
        updated += 1;
      }
    } else {
      await prisma.opcodeCategory.create({
        data: {
          storeId: null,
          opcode,
          category: s.category,
          commodityKey: s.commodityKey ?? null,
        },
      });
      inserted += 1;
    }
  }

  const total = await prisma.opcodeCategory.count({ where: { storeId: null } });
  console.log(`done. inserted=${inserted} updated=${updated} unchanged=${seeds.length - inserted - updated}`);
  console.log(`Total global OpcodeCategory rows: ${total}`);

  // Store-scoped MENU overrides (SERVICE_MENU opcodes that don't match the
  // TEK regex — verified per-store in the Tekion opcode catalogs).
  let storeInserted = 0;
  let storeUpdated = 0;
  for (const { storeAbbrev, opcodes } of MENU_STORE_SPECIFIC) {
    const store = await prisma.store.findFirst({
      where: { abbreviation: storeAbbrev },
      select: { id: true },
    });
    if (!store) {
      console.warn(`  WARN: store ${storeAbbrev} not found — skipping its MENU overrides`);
      continue;
    }
    for (const raw of opcodes) {
      const opcode = raw.toUpperCase().trim();
      const existing = await prisma.opcodeCategory.findFirst({
        where: { storeId: store.id, opcode },
        select: { id: true, category: true, commodityKey: true },
      });
      if (existing) {
        if (existing.category !== "MENU" || existing.commodityKey !== null) {
          await prisma.opcodeCategory.update({
            where: { id: existing.id },
            data: { category: "MENU", commodityKey: null },
          });
          storeUpdated += 1;
        }
      } else {
        await prisma.opcodeCategory.create({
          data: { storeId: store.id, opcode, category: "MENU", commodityKey: null },
        });
        storeInserted += 1;
      }
    }
  }
  console.log(`store-scoped MENU overrides: inserted=${storeInserted} updated=${storeUpdated}`);

  const byCategory = await prisma.opcodeCategory.groupBy({
    where: { storeId: null },
    by: ["category"],
    _count: { _all: true },
  });
  for (const row of byCategory) {
    console.log(`  ${row.category}: ${row._count._all}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("seed-opcode-categories FAILED:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
