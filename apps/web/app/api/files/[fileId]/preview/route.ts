import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth/api-guard";
import { requireFileAccess } from "@/lib/server/authz";

export const runtime = "nodejs";

type RouteCtx = { params: { fileId: string } };

export const GET = withAuth<RouteCtx>(async (req, ctx, tc) => {
  const fileId = ctx.params.fileId;
  const parsedId = z.string().uuid().safeParse(fileId);
  if (!parsedId.success)
    return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });

  await requireFileAccess(tc, fileId);

  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "20"))
  );

  const file = await prisma.ingestedFile.findUnique({ where: { id: fileId } });

  const rows = await prisma.rawReportRow.findMany({
    where: { ingestedFileId: fileId },
    orderBy: { rowIndex: "asc" },
    take: limit,
  });

  return NextResponse.json({
    file: {
      id: file!.id,
      originalFilename: file!.originalFilename,
      detectedType: file!.detectedType,
      detectionConfidence: file!.detectionConfidence,
      rawMeta: file!.rawMeta,
    },
    rows: rows.map((r) => ({ rowIndex: r.rowIndex, data: r.data })),
  });
});
