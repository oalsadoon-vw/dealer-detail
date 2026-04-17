import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { requireManagerOrHigher, requireRunAccess } from "@/lib/server/authz";

export const runtime = "nodejs";

type RouteCtx = { params: { runId: string } };

export const POST = withAuth<RouteCtx>(async (_req, ctx, tc) => {
  const parsed = z.string().uuid().safeParse(ctx.params.runId);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });

  requireManagerOrHigher(tc);
  const run = await requireRunAccess(tc, ctx.params.runId);

  const { reaggregateStoreDate } = await import(
    "@/lib/parsing/reaggregation"
  );
  await reaggregateStoreDate(run.storeId, run.businessDate);

  return NextResponse.json({ success: true });
});
