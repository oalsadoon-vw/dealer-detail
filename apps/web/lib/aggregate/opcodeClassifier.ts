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
 * Brand-agnostic Tekion factory SERVICE_MENU opcode pattern.
 *
 * Tekion auto-generates menu-package opcodes as
 *   TEK<mileage><B|P|V><N|S>M
 * e.g. TEK15000BNM (15k basic/normal), TEK100000VNM (100k value/normal),
 * TEK90000PSM (90k plus/severe). Verified identical across brands: the
 * BC (Chevrolet) and TOL (Toyota) opcode catalogs each carry the same
 * 212-opcode set with opcodeType=SERVICE_MENU. This pattern therefore
 * classifies factory menus for EVERY store regardless of make.
 *
 * Deliberately narrow: TEK-prefixed individual factory services look like
 * TEK07120301 (8-digit operation ids, no [BPV][NS]M suffix) and must NOT
 * match — those are à-la-carte ops, not menu packages.
 */
const TEK_MENU_PATTERN = /^TEK\d{4,6}[BPV][NS]M$/;

/**
 * Look up a single opcode. DB mappings (store override > global) win;
 * otherwise fall back to the brand-agnostic TEK menu pattern. Returns null
 * when the opcode is unmapped — the caller should count this as a warning
 * (still include labor/parts in daily totals so the store-wide gross stays
 * whole).
 */
export function classifyOpcode(
  map: OpcodeMap,
  opcode: string | null | undefined,
): OpcodeMapping | null {
  const key = normalizeOpcode(opcode);
  if (!key) return null;
  const mapped = map.get(key);
  if (mapped) return mapped;
  if (TEK_MENU_PATTERN.test(key)) {
    return { category: "MENU", commodityKey: null };
  }
  return null;
}
