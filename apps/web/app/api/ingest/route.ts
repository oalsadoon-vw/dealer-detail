import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestFiles } from "@/lib/ingest";
import { withAuth } from "@/lib/auth/api-guard";
import { requireManagerOrHigher, requireStoreAccess } from "@/lib/server/authz";
import { invalidateRunsCache } from "@/lib/server/services/runs";
import { invalidateDashboardCache } from "@/lib/server/services/dashboard";

export const runtime = "nodejs";

const IngestSchema = z.object({
  storeId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = withAuth(async (req, _ctx, tc) => {
  requireManagerOrHigher(tc);

  const form = await req.formData();

  const storeId = form.get("storeId");
  const businessDate = form.get("businessDate");
  const parsedInput = IngestSchema.safeParse({ storeId, businessDate });
  if (!parsedInput.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsedInput.error.flatten() },
      { status: 400 }
    );
  }

  requireStoreAccess(tc, parsedInput.data.storeId);

  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const fileBuffers = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      buffer: Buffer.from(await f.arrayBuffer()),
    }))
  );

  const result = await ingestFiles({
    storeId: parsedInput.data.storeId,
    businessDate: parsedInput.data.businessDate,
    files: fileBuffers,
  });

  invalidateRunsCache();
  invalidateDashboardCache(parsedInput.data.storeId);

  return NextResponse.json(result);
});
