import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth/api-guard";
import { requireStoreAccess } from "@/lib/server/authz";

export const runtime = "nodejs";

export const GET = withAuth(async (req, _ctx, tc) => {
  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId");

  const parsed = z.string().uuid().safeParse(storeId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "storeId (uuid) query param is required" },
      { status: 400 }
    );
  }

  requireStoreAccess(tc, parsed.data);

  const runs = await prisma.ingestionRun.findMany({
    where: { storeId: parsed.data },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
    include: { files: true },
  });

  return NextResponse.json(runs);
});
