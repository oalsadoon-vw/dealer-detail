import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: { runId: string } }) {
    const parsed = z.string().uuid().safeParse(ctx.params.runId);
    if (!parsed.success) return NextResponse.json({ error: "Invalid runId" }, { status: 400 });

    const run = await prisma.ingestionRun.findUnique({
        where: { id: ctx.params.runId },
        select: { storeId: true, businessDate: true }
    });

    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { reaggregateStoreDate } = await import("@/lib/parsing/reaggregation");
    await reaggregateStoreDate(run.storeId, run.businessDate);

    return NextResponse.json({ success: true });
}
