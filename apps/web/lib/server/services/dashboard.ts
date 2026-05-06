import { prisma } from "@/lib/db";
import { requireStoreAccess } from "@/lib/server/authz";
import type { TenantContext } from "@/lib/server/tenant-context";
import { perfStart } from "@/lib/server/perf";
import { cacheGet, cacheSet, cacheInvalidatePrefix } from "@/lib/server/cache";

const DASHBOARD_TTL_MS = Number(process.env.DD_DASHBOARD_TTL_MS ?? 60_000);

function dashboardCacheKey(userId: string, params: DashboardParams): string {
  const norm =
    "runId" in params
      ? `run:${params.runId}`
      : "businessDate" in params
        ? `day:${params.storeId}:${params.businessDate}`
        : `range:${params.storeId}:${params.startDate}:${params.endDate}`;
  return `dash:${userId}:${norm}`;
}

/**
 * Invalidates every cached dashboard view for a single store. Call this
 * from any server action that mutates the underlying data (run delete,
 * rerun, ingest, etc.) so the dashboard reflects the change on the next
 * navigation. Storeless invalidate clears every user's view.
 */
export function invalidateDashboardCache(storeId?: string): number {
  if (!storeId) return cacheInvalidatePrefix("dash:");
  // Cache keys include user IDs we don't enumerate, so wipe everything
  // tagged with the store ID across all users.
  let count = 0;
  for (const prefix of ["dash:"]) {
    count += cacheInvalidatePrefix(prefix);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Public types — shared by the API route AND by the dashboard client.
// ---------------------------------------------------------------------------

export type DashboardParams =
  | { runId: string }
  | { storeId: string; businessDate: string }
  | { storeId: string; startDate: string; endDate: string };

export type DashboardAdvisor = {
  advisorId: string;
  advisorName: string;
  metrics: {
    openRos: number;
    menuCount: number;
    menuLaborGross: number;
    menuPartsGross: number;
    alaCount: number;
    alaLaborGross: number;
    alaPartsGross: number;
    recCount: number;
    recSoldCount: number;
    recAmount: number;
    recSoldAmount: number;
    dailyLaborGross: number;
    dailyPartsGross: number;
  };
  commodities: Record<string, { qty: number; gross: number; laborGross: number }>;
};

export type DashboardData = {
  store: { id: string; name: string };
  businessDate: string | null;
  dateRange: { startDate: string; endDate: string } | null;
  rangeDays: number | null;
  run: null | {
    id: string;
    batchNo: number | null;
    status: string;
    createdAt: string;
    files: Array<{
      id: string;
      originalFilename: string;
      detectedType: string | null;
      detectionConfidence: number | null;
    }>;
  };
  commodityKeys: string[];
  advisors: DashboardAdvisor[];
  dailySeries: Array<{
    date: string;
    openRos: number;
    menuCount: number;
    alaCount: number;
    dailyGross: number;
    commodityQty: number;
    commodityGross: number;
  }>;
  commodityMix: Array<{
    commodityKey: string;
    qty: number;
    gross: number;
    laborGross: number;
  }>;
};

export class DashboardNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBusinessDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function daysInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, days);
}

const EMPTY_METRICS = {
  openRos: 0,
  menuCount: 0,
  menuLaborGross: 0,
  menuPartsGross: 0,
  alaCount: 0,
  alaLaborGross: 0,
  alaPartsGross: 0,
  recCount: 0,
  recSoldCount: 0,
  recAmount: 0,
  recSoldAmount: 0,
  dailyLaborGross: 0,
  dailyPartsGross: 0,
};

// ---------------------------------------------------------------------------
// Main entry: load fully-shaped dashboard data for a (store + range) view.
// ---------------------------------------------------------------------------

/**
 * Loads the dashboard view for the given params. Used by:
 *   - GET /api/dashboard (filter changes from the client)
 *   - app/(app)/dashboard/page.tsx (server-rendered first paint)
 *
 * Throws `DashboardNotFoundError` for missing run/store; let the caller
 * decide whether that's a 404 or a redirect.
 */
export async function loadDashboardData(
  tc: TenantContext,
  params: DashboardParams
): Promise<DashboardData> {
  // Process-level cache. We still enforce access control on cache HITs
  // (via the cached `store.id`) so a user with revoked access can't
  // ride a previously-cached payload past the TTL boundary.
  const cacheKey = dashboardCacheKey(tc.user.profileId, params);
  const cached = cacheGet<DashboardData>(cacheKey);
  if (cached) {
    requireStoreAccess(tc, cached.store.id);
    const tHit = perfStart("dashboard cache HIT");
    tHit.end();
    return cached;
  }

  const tTotal = perfStart("dashboard.loadDashboardData");
  try {
    // 1. Resolve the store + run target from params.
    type RunWithFiles = {
      id: string;
      batchNo: number | null;
      status: string;
      createdAt: Date;
      businessDate: Date;
      files: Array<{
        id: string;
        originalFilename: string;
        detectedType: string | null;
        detectionConfidence: number | null;
      }>;
    };

    let store: { id: string; name: string } | null = null;
    let run: RunWithFiles | null = null;
    let bizDate: Date | null = null;
    let bizDateStr: string | null = null;
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    let range: { startDate: string; endDate: string } | null = null;
    let rangeDays: number | null = null;

    if ("runId" in params) {
      const t = perfStart("dashboard.run.findUnique");
      const found = await prisma.ingestionRun.findUnique({
        where: { id: params.runId },
        include: { files: true, store: true },
      });
      t.end();
      if (!found) throw new DashboardNotFoundError("Run not found");
      run = {
        id: found.id,
        batchNo: found.batchNo ?? null,
        status: found.status,
        createdAt: found.createdAt,
        businessDate: found.businessDate,
        files: found.files.map((f) => ({
          id: f.id,
          originalFilename: f.originalFilename,
          detectedType: f.detectedType ?? null,
          detectionConfidence: f.detectionConfidence ?? null,
        })),
      };
      store = { id: found.store.id, name: found.store.name };
      bizDate = found.businessDate;
      bizDateStr = found.businessDate.toISOString().slice(0, 10);
    } else {
      const t = perfStart("dashboard.store.findUnique");
      const foundStore = await prisma.store.findUnique({
        where: { id: params.storeId },
      });
      t.end();
      if (!foundStore) throw new DashboardNotFoundError("Store not found");
      store = { id: foundStore.id, name: foundStore.name };

      if ("businessDate" in params) {
        bizDateStr = params.businessDate;
        bizDate = parseBusinessDate(bizDateStr);
        const tRun = perfStart("dashboard.run.findFirst");
        const foundRun = await prisma.ingestionRun.findFirst({
          where: { storeId: params.storeId, businessDate: bizDate },
          orderBy: { createdAt: "desc" },
          include: { files: true },
        });
        tRun.end();
        run = foundRun
          ? {
              id: foundRun.id,
              batchNo: foundRun.batchNo ?? null,
              status: foundRun.status,
              createdAt: foundRun.createdAt,
              businessDate: foundRun.businessDate,
              files: foundRun.files.map((f) => ({
                id: f.id,
                originalFilename: f.originalFilename,
                detectedType: f.detectedType ?? null,
                detectionConfidence: f.detectionConfidence ?? null,
              })),
            }
          : null;
      } else {
        range = { startDate: params.startDate, endDate: params.endDate };
        rangeStart = parseBusinessDate(range.startDate);
        rangeEnd = parseBusinessDate(range.endDate);
        rangeDays = daysInclusive(rangeStart, rangeEnd);
        run = null;
      }
    }

    requireStoreAccess(tc, store!.id);

    // 2. Build the unified where-clause used by every read below.
    const rangeWhere = range
      ? {
          storeId: store.id,
          businessDate: { gte: rangeStart!, lt: addDays(rangeEnd!, 1) },
        }
      : { storeId: store.id, businessDate: bizDate! };

    // 3. Fan out the five independent reads in parallel. Two of them have
    //    a `laborGross` fallback for older Prisma clients pre-regeneration.
    const groupCommodityByDay = async () => {
      try {
        return await (prisma.advisorDailyCommodity as any).groupBy({
          by: ["businessDate"],
          where: rangeWhere,
          _sum: { qty: true, gross: true, laborGross: true },
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("Unknown field") && msg.includes("laborGross")) {
          return (prisma.advisorDailyCommodity as any).groupBy({
            by: ["businessDate"],
            where: rangeWhere,
            _sum: { qty: true, gross: true },
          });
        }
        throw e;
      }
    };

    const groupCommodityMix = async () => {
      try {
        return await (prisma.advisorDailyCommodity as any).groupBy({
          by: ["commodityKey"],
          where: rangeWhere,
          _sum: { qty: true, gross: true, laborGross: true },
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("Unknown field") && msg.includes("laborGross")) {
          return (prisma.advisorDailyCommodity as any).groupBy({
            by: ["commodityKey"],
            where: rangeWhere,
            _sum: { qty: true, gross: true },
          });
        }
        throw e;
      }
    };

    const tQueries = perfStart("dashboard.queries (5x parallel)");
    const [metrics, commodities, metricsByDay, commoditiesByDay, commodityMix] =
      await Promise.all([
        prisma.advisorDailyMetrics.findMany({
          where: rangeWhere,
          include: { advisor: true },
        }),
        prisma.advisorDailyCommodity.findMany({
          where: rangeWhere,
          include: { advisor: true },
        }),
        prisma.advisorDailyMetrics.groupBy({
          by: ["businessDate"],
          where: rangeWhere,
          _sum: {
            openRos: true,
            menuCount: true,
            alaCount: true,
            recAmount: true,
            recSoldAmount: true,
            dailyLaborGross: true,
            dailyPartsGross: true,
          },
        }),
        groupCommodityByDay(),
        groupCommodityMix(),
      ]);
    tQueries.end(
      `metrics=${metrics.length} commodities=${commodities.length} days=${metricsByDay.length}`
    );

    // 4. Shape the response.
    const commodityKeys = Array.from(
      new Set(commodities.map((c) => c.commodityKey))
    ).sort((a, b) => a.localeCompare(b));

    const commoditiesByAdvisor: Record<
      string,
      Record<string, { qty: number; gross: number; laborGross: number }>
    > = {};
    for (const c of commodities) {
      commoditiesByAdvisor[c.advisorId] = commoditiesByAdvisor[c.advisorId] ?? {};
      const prev = commoditiesByAdvisor[c.advisorId][c.commodityKey] ?? {
        qty: 0,
        gross: 0,
        laborGross: 0,
      };
      commoditiesByAdvisor[c.advisorId][c.commodityKey] = {
        qty: prev.qty + (c.qty ?? 0),
        gross: prev.gross + (c.gross ?? 0),
        laborGross: prev.laborGross + (c.laborGross ?? 0),
      };
    }

    const byAdvisor: Record<
      string,
      { advisorId: string; advisorName: string; metrics: typeof EMPTY_METRICS }
    > = {};

    for (const m of metrics) {
      const key = m.advisorId;
      byAdvisor[key] = byAdvisor[key] ?? {
        advisorId: m.advisorId,
        advisorName: m.advisor.nameNormalized,
        metrics: { ...EMPTY_METRICS },
      };
      const t = byAdvisor[key].metrics;
      t.openRos += m.openRos ?? 0;
      t.menuCount += m.menuCount ?? 0;
      t.menuLaborGross += m.menuLaborGross ?? 0;
      t.menuPartsGross += m.menuPartsGross ?? 0;
      t.alaCount += m.alaCount ?? 0;
      t.alaLaborGross += m.alaLaborGross ?? 0;
      t.alaPartsGross += m.alaPartsGross ?? 0;
      t.recCount += m.recCount ?? 0;
      t.recSoldCount += m.recSoldCount ?? 0;
      t.recAmount += m.recAmount ?? 0;
      t.recSoldAmount += m.recSoldAmount ?? 0;
      t.dailyLaborGross += m.dailyLaborGross ?? 0;
      t.dailyPartsGross += m.dailyPartsGross ?? 0;
    }

    // Ensure advisors that only have commodity rows still show up.
    for (const advisorId of Object.keys(commoditiesByAdvisor)) {
      if (byAdvisor[advisorId]) continue;
      const anyComm = commodities.find((c) => c.advisorId === advisorId);
      byAdvisor[advisorId] = {
        advisorId,
        advisorName: anyComm?.advisor?.nameNormalized ?? advisorId,
        metrics: { ...EMPTY_METRICS },
      };
    }

    const advisors: DashboardAdvisor[] = Object.values(byAdvisor)
      .map((a) => ({
        ...a,
        commodities: commoditiesByAdvisor[a.advisorId] ?? {},
      }))
      .sort((a, b) => a.advisorName.localeCompare(b.advisorName));

    const commodityByDate = new Map<
      string,
      { qty: number; gross: number; laborGross: number }
    >();
    for (const r of commoditiesByDay as Array<{
      businessDate: Date;
      _sum: { qty: number | null; gross: number | null; laborGross: number | null };
    }>) {
      const d = r.businessDate.toISOString().slice(0, 10);
      commodityByDate.set(d, {
        qty: Number(r._sum.qty ?? 0),
        gross: Number(r._sum.gross ?? 0),
        laborGross: Number(r._sum.laborGross ?? 0),
      });
    }

    const dailySeries = metricsByDay
      .map((r) => {
        const d = (r.businessDate as Date).toISOString().slice(0, 10);
        const dailyLabor = Number(r._sum.dailyLaborGross ?? 0);
        const dailyParts = Number(r._sum.dailyPartsGross ?? 0);
        const comm = commodityByDate.get(d) ?? { qty: 0, gross: 0, laborGross: 0 };
        return {
          date: d,
          openRos: Number(r._sum.openRos ?? 0),
          menuCount: Number(r._sum.menuCount ?? 0),
          alaCount: Number(r._sum.alaCount ?? 0),
          dailyGross: dailyLabor + dailyParts,
          commodityQty: comm.qty,
          commodityGross: comm.gross + comm.laborGross,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const result: DashboardData = {
      store,
      businessDate: bizDateStr,
      dateRange: range,
      rangeDays,
      run: run
        ? {
            id: run.id,
            batchNo: run.batchNo,
            status: run.status,
            createdAt: run.createdAt.toISOString(),
            files: run.files,
          }
        : null,
      commodityKeys,
      advisors,
      dailySeries,
      commodityMix: (commodityMix as any[])
        .map((r: any) => ({
          commodityKey: r.commodityKey as string,
          qty: Number(r._sum.qty ?? 0),
          gross: Number(r._sum.gross ?? 0),
          laborGross: Number(r._sum.laborGross ?? 0),
        }))
        .sort(
          (a: { commodityKey: string }, b: { commodityKey: string }) =>
            a.commodityKey.localeCompare(b.commodityKey)
        ),
    };

    cacheSet(cacheKey, result, DASHBOARD_TTL_MS);
    return result;
  } finally {
    tTotal.end();
  }
}
