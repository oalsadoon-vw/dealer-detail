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

// Explicit MENU codes (Toyota factory-scheduled maintenance menus).
const MENU_EXPLICIT: string[] = [
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
  "TAC30",
  "TAC35",
  "TAC40",
  "TAC45",
  "TAC50",
  "TAC60",
  "TAC70",
];

// Explicit COMMODITY codes -> commodity bucket.
const COMMODITY_EXPLICIT: Array<{ opcode: string; commodityKey: string }> = [
  { opcode: "ROTATE", commodityKey: "tires" },
  { opcode: "ROTATE00RBA", commodityKey: "tires" },
  { opcode: "4TIRE", commodityKey: "tires" },
  { opcode: "TPMS", commodityKey: "tires" },
  { opcode: "ALIGN", commodityKey: "alignment" },
  { opcode: "FACBRAKE", commodityKey: "brakes" },
  { opcode: "BATT", commodityKey: "battery" },
  { opcode: "WIPER", commodityKey: "wipers" },
];

// Explicit ALA codes (à la carte customer-pay non-menu service ops).
const ALA_EXPLICIT: string[] = [
  "VAC",
  "MPVI",
  "MISC",
  "EARLYBIRD",
  "DIAG",
  "LOF",
  "AIR",
  "UCMPVI",
];

function buildSeeds(): Seed[] {
  const seeds: Seed[] = [];
  for (const opcode of MENU_EXPLICIT) {
    seeds.push({ opcode, category: "MENU", commodityKey: null });
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
