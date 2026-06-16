import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth/api-guard";
import {
  requireManagerOrHigher,
  requireStoreAccess,
  assertStoreBelongsToOrg,
} from "@/lib/server/authz";
import { collectRepairOrders } from "@/lib/sources/tekion/collector";
import { aggregateMetrics } from "@/lib/aggregate/aggregator";
import { invalidateRunsCache } from "@/lib/server/services/runs";
import { invalidateDashboardCache } from "@/lib/server/services/dashboard";

export const runtime = "nodejs";

type RouteCtx = { params: { storeId: string } };

const BodySchema = z.object({
  days: z.number().int().positive().max(31).optional(),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
});

const DEFAULT_DAYS = 3;
const STALE_RUN_MINUTES = 30;

/**
 * Detect environments where the host-side browser advisor resolver isn't
 * available. On Vercel / any serverless container, the localhost:9223 Tekion
 * browser session that the resolver depends on simply does not exist. We
 * surface a clean 501 there rather than letting advisor lookups silently fail.
 */
function isServerlessOrBrowserResolver(): boolean {
  if (process.env.VERCEL) return true;
  const r = (process.env.TEKION_ADVISOR_RESOLVER ?? "").toLowerCase();
  return r === "browser";
}

/**
 * POST /api/sync/{storeId} — kick off a manual Tekion sync (collect -> aggregate)
 * for one store. Mirrors the auth + tenant scoping used by /api/ingest and
 * /api/runs: manager-or-higher role, store-scoped access, store-in-org check.
 *
 * Serverless guard: refuses to run when the advisor resolver depends on a
 * machine-local browser session (browser mode, or running on Vercel) — the
 * pilot uses scripts/sync-st.ts on the collector host for now.
 *
 * Concurrency guard: returns 409 if a non-stale RUNNING SyncRun exists for
 * the store so we don't double-launch and hammer the Tekion 429 budget.
 */
export const POST = withAuth<RouteCtx>(async (req, ctx, tc) => {
  // 1) Validate path param.
  const parsedStoreId = z.string().uuid().safeParse(ctx.params.storeId);
  if (!parsedStoreId.success) {
    return NextResponse.json(
      { error: "Invalid storeId (uuid required)" },
      { status: 400 },
    );
  }
  const storeId = parsedStoreId.data;

  // 2) Auth: same pattern as /api/ingest — manager or higher, store-scoped,
  //    and the store must belong to the caller's current org.
  requireManagerOrHigher(tc);
  requireStoreAccess(tc, storeId);
  await assertStoreBelongsToOrg(storeId, tc.org.organizationId);

  // 3) Serverless guard — the browser advisor resolver only works on the
  //    collector host. Bail before any DB writes so the caller sees a clean
  //    capability error rather than a half-finished run.
  if (isServerlessOrBrowserResolver()) {
    return NextResponse.json(
      {
        error:
          "manual sync runs on the collector host only (browser advisor " +
          "resolver unavailable in serverless); use the CLI / host-side trigger",
      },
      { status: 501 },
    );
  }

  // 4) Load + validate store config.
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      tekionDealerId: true,
      apiSyncEnabled: true,
    },
  });
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }
  if (!store.apiSyncEnabled) {
    return NextResponse.json(
      { error: "Store does not have apiSyncEnabled" },
      { status: 400 },
    );
  }
  if (!store.tekionDealerId) {
    return NextResponse.json(
      { error: "Store is missing tekionDealerId" },
      { status: 400 },
    );
  }

  // 5) Parse body (all optional).
  let body: z.infer<typeof BodySchema> = {};
  try {
    const text = await req.text();
    if (text.trim().length > 0) {
      const json: unknown = JSON.parse(text);
      const parsed = BodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid body", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      body = parsed.data;
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid JSON body: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  // 6) Resolve window.
  const now = new Date();
  let windowStart: Date;
  let windowEnd: Date;
  if (body.windowStart && body.windowEnd) {
    windowStart = new Date(body.windowStart);
    windowEnd = new Date(body.windowEnd);
    if (
      isNaN(windowStart.getTime()) ||
      isNaN(windowEnd.getTime()) ||
      windowEnd.getTime() <= windowStart.getTime()
    ) {
      return NextResponse.json(
        { error: "windowEnd must be after windowStart" },
        { status: 400 },
      );
    }
  } else {
    const days = body.days ?? DEFAULT_DAYS;
    windowEnd = now;
    windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // 7) Concurrency guard — refuse to launch a second concurrent collector for
  //    the same store. A run is "stale" once it's been RUNNING past the
  //    reaper's cutoff; in that case it'll be cleaned up by the collector's
  //    own reapStaleRuns call, so we allow the new run.
  const staleCutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60 * 1000);
  const inflight = await prisma.syncRun.findFirst({
    where: {
      storeId,
      status: "RUNNING",
      startedAt: { gte: staleCutoff },
    },
    select: { id: true, startedAt: true, kind: true },
    orderBy: { startedAt: "desc" },
  });
  if (inflight) {
    return NextResponse.json(
      {
        error: "sync already in progress",
        runningSyncRunId: inflight.id,
        startedAt: inflight.startedAt,
        kind: inflight.kind,
      },
      { status: 409 },
    );
  }

  // 8) Run collect -> aggregate. Aggregator is scoped to the businessDates the
  //    collector just touched so we don't churn other days' rows.
  const collectResult = await collectRepairOrders({
    storeId,
    tekionDealerId: store.tekionDealerId,
    windowStart,
    windowEnd,
    kind: "MANUAL",
  });

  // The window can straddle two business dates (midnight UTC). Pass the
  // touched dates explicitly so the aggregator only rebuilds what changed.
  const touchedDates = await prisma.rawRepairOrder.findMany({
    where: {
      storeId,
      OR: [
        { fetchedAt: { gte: windowStart, lte: windowEnd } },
        { businessDate: { gte: businessDateFloor(windowStart), lte: businessDateFloor(windowEnd) } },
      ],
    },
    select: { businessDate: true },
    distinct: ["businessDate"],
  });
  const businessDates = touchedDates.map((r) => r.businessDate);

  const aggregateResult = await aggregateMetrics({
    storeId,
    businessDates: businessDates.length > 0 ? businessDates : undefined,
    syncRunId: collectResult.syncRunId,
  });

  invalidateRunsCache();
  invalidateDashboardCache(storeId);

  const syncRun = await prisma.syncRun.findUnique({
    where: { id: collectResult.syncRunId },
    select: { id: true, status: true, startedAt: true, finishedAt: true },
  });

  return NextResponse.json({
    storeId,
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    },
    syncRun,
    collect: collectResult,
    aggregate: aggregateResult,
  });
});

function businessDateFloor(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
