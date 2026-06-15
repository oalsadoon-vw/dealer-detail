import { prisma } from "@/lib/db";

export type OpcodeCategoryName = "MENU" | "ALA" | "REC" | "COMMODITY";

export interface OpcodeMapping {
  category: OpcodeCategoryName;
  commodityKey: string | null;
}

export type OpcodeMap = Map<string, OpcodeMapping>;

export function normalizeOpcode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * Load the effective OpcodeCategory map for a store. Store-specific rows
 * (storeId === storeId) override globals (storeId === NULL). Keys are normalized
 * via normalizeOpcode (UPPER, trimmed) so classifyOpcode can do a single lookup.
 */
export async function loadOpcodeCategories(storeId: string): Promise<OpcodeMap> {
  const rows = await prisma.opcodeCategory.findMany({
    where: { OR: [{ storeId: null }, { storeId }] },
    select: { storeId: true, opcode: true, category: true, commodityKey: true },
  });
  const map: OpcodeMap = new Map();
  // Apply globals first, then store-specific overrides on top.
  for (const r of rows) {
    if (r.storeId !== null) continue;
    map.set(normalizeOpcode(r.opcode), {
      category: r.category as OpcodeCategoryName,
      commodityKey: r.commodityKey ?? null,
    });
  }
  for (const r of rows) {
    if (r.storeId !== storeId) continue;
    map.set(normalizeOpcode(r.opcode), {
      category: r.category as OpcodeCategoryName,
      commodityKey: r.commodityKey ?? null,
    });
  }
  return map;
}

/**
 * Look up a single opcode. Returns null when the opcode is unmapped — the
 * caller should count this as a warning (still include labor/parts in daily
 * totals so the store-wide gross stays whole).
 */
export function classifyOpcode(
  map: OpcodeMap,
  opcode: string | null | undefined,
): OpcodeMapping | null {
  const key = normalizeOpcode(opcode);
  if (!key) return null;
  return map.get(key) ?? null;
}
