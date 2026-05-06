import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/auth/api-guard";
import {
  loadDashboardData,
  DashboardNotFoundError,
  type DashboardParams,
} from "@/lib/server/services/dashboard";

export const runtime = "nodejs";

const QuerySchema = z
  .object({
    runId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (v) =>
      Boolean(v.runId) ||
      (Boolean(v.storeId) && Boolean(v.businessDate)) ||
      (Boolean(v.storeId) && Boolean(v.startDate) && Boolean(v.endDate)),
    {
      message:
        "Provide either runId, (storeId + businessDate), or (storeId + startDate + endDate)",
    }
  );

export const GET = withAuth(async (req, _ctx, tc) => {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      runId: url.searchParams.get("runId") ?? undefined,
      storeId: url.searchParams.get("storeId") ?? undefined,
      businessDate: url.searchParams.get("businessDate") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let params: DashboardParams;
    if (parsed.data.runId) {
      params = { runId: parsed.data.runId };
    } else if (parsed.data.businessDate) {
      params = {
        storeId: parsed.data.storeId!,
        businessDate: parsed.data.businessDate,
      };
    } else {
      params = {
        storeId: parsed.data.storeId!,
        startDate: parsed.data.startDate!,
        endDate: parsed.data.endDate!,
      };
    }

    const data = await loadDashboardData(tc, params);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof DashboardNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Dashboard query failed", details: String(e) },
      { status: 500 }
    );
  }
});
