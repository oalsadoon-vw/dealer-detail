import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: { runId: string } }) {
  const parsed = z.string().uuid().safeParse(ctx.params.runId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid runId" }, { status: 400 });

  const run = await prisma.ingestionRun.findUnique({
    where: { id: ctx.params.runId },
    include: { files: true, store: true }
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(_req: Request, ctx: { params: { runId: string } }) {
  const parsed = z.string().uuid().safeParse(ctx.params.runId);
  if (!parsed.success) return NextResponse.json({ error: "Invalid runId" }, { status: 400 });

  const run = await prisma.ingestionRun.findUnique({
    where: { id: ctx.params.runId },
    select: { storeId: true, businessDate: true }
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 2. Delete the run (cascades to IngestedFile, RawReportRow)
  await prisma.ingestionRun.delete({
    where: { id: ctx.params.runId }
  });

  // 3. RE-AGGREGATE remaining runs for this day to fix the metrics
  const { reaggregateStoreDate } = await import("@/lib/parsing/reaggregation");
  await reaggregateStoreDate(run.storeId, run.businessDate);

  return NextResponse.json({ success: true });
}
