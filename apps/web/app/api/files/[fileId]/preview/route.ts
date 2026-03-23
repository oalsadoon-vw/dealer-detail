import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: { fileId: string } }) {
  const fileId = ctx.params.fileId;
  const parsedId = z.string().uuid().safeParse(fileId);
  if (!parsedId.success) return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));

  const file = await prisma.ingestedFile.findUnique({
    where: { id: fileId }
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.rawReportRow.findMany({
    where: { ingestedFileId: fileId },
    orderBy: { rowIndex: "asc" },
    take: limit
  });

  return NextResponse.json({
    file: {
      id: file.id,
      originalFilename: file.originalFilename,
      detectedType: file.detectedType,
      detectionConfidence: file.detectionConfidence,
      rawMeta: file.rawMeta
    },
    rows: rows.map((r) => ({ rowIndex: r.rowIndex, data: r.data }))
  });
}


