import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth/api-guard";
import { requireManagerOrHigher, requireRunAccess } from "@/lib/server/authz";
import { invalidateRunsCache } from "@/lib/server/services/runs";
import { invalidateDashboardCache } from "@/lib/server/services/dashboard";

export const runtime = "nodejs";

type RouteCtx = { params: { runId: string } };

export const GET = withAuth<RouteCtx>(async (_req, ctx, tc) => {
  const parsed = z.string().uuid().safeParse(ctx.params.runId);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });

  await requireRunAccess(tc, ctx.params.runId);

  const run = await prisma.ingestionRun.findUnique({
    where: { id: ctx.params.runId },
    include: { files: true, store: true },
  });

  return NextResponse.json(run);
});

export const DELETE = withAuth<RouteCtx>(async (_req, ctx, tc) => {
  const parsed = z.string().uuid().safeParse(ctx.params.runId);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });

  requireManagerOrHigher(tc);
  const run = await requireRunAccess(tc, ctx.params.runId);

  await prisma.ingestionRun.delete({ where: { id: ctx.params.runId } });

  const { reaggregateStoreDate } = await import(
    "@/lib/parsing/reaggregation"
  );
  await reaggregateStoreDate(run.storeId, run.businessDate);

  invalidateRunsCache();
  invalidateDashboardCache(run.storeId);

  return NextResponse.json({ success: true });
});
