import { prisma } from "@/lib/db";
import { requireStoreAccess } from "@/lib/server/authz";
import type { TenantContext } from "@/lib/server/tenant-context";
import { perfStart } from "@/lib/server/perf";
import { cacheGet, cacheSet, cacheInvalidatePrefix } from "@/lib/server/cache";

const RUNS_TTL_MS = Number(process.env.DD_RUNS_TTL_MS ?? 30_000);

export type RunRow = {
  id: string;
  storeId: string;
  businessDate: string;
  batchNo: number;
  status: string;
  createdAt: string;
  files: Array<{ id: string }>;
};

/**
 * Invalidates every cached runs list. Call after any mutation that
 * changes the run set for a store (ingest, rerun, delete).
 */
export function invalidateRunsCache(): number {
  return cacheInvalidatePrefix("runs:");
}

/**
 * Returns the list of ingestion runs for a single store, newest first.
 * Used by:
 *   - GET /api/runs (store-switch refetches from the client)
 *   - app/(app)/runs/page.tsx (server-rendered first paint)
 *
 * Process-level cached for 30s. Access is re-checked on every cache hit.
 */
export async function listRunsForStore(
  tc: TenantContext,
  storeId: string
): Promise<RunRow[]> {
  requireStoreAccess(tc, storeId);

  const cacheKey = `runs:${tc.user.profileId}:${storeId}`;
  const cached = cacheGet<RunRow[]>(cacheKey);
  if (cached) {
    const t = perfStart("runs cache HIT");
    t.end(`runs=${cached.length}`);
    return cached;
  }

  const t = perfStart("runs.listRunsForStore");
  const rows = await prisma.ingestionRun.findMany({
    where: { storeId },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
    include: { files: { select: { id: true } } },
  });
  t.end(`runs=${rows.length}`);

  const result: RunRow[] = rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    businessDate: r.businessDate.toISOString().slice(0, 10),
    batchNo: r.batchNo,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    files: r.files.map((f) => ({ id: f.id })),
  }));

  cacheSet(cacheKey, result, RUNS_TTL_MS);
  return result;
}
