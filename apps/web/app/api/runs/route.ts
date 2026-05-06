import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { listRunsForStore } from "@/lib/server/services/runs";

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

  const runs = await listRunsForStore(tc, parsed.data);
  return NextResponse.json(runs);
});
