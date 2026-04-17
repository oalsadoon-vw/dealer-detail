import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { listAccessibleStores, createStore } from "@/lib/server/services/stores";
import { requireOrgAdmin } from "@/lib/server/authz";

export const runtime = "nodejs";

export const GET = withAuth(async (_req, _ctx, tc) => {
  const stores = await listAccessibleStores(tc);
  return NextResponse.json(stores);
});

const CreateStoreSchema = z.object({
  name: z.string().min(1),
  abbreviation: z.string().optional(),
  timezone: z.string().optional(),
});

export const POST = withAuth(async (req, _ctx, tc) => {
  requireOrgAdmin(tc);

  const json = await req.json().catch(() => null);
  const parsed = CreateStoreSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const store = await createStore(tc, {
    name: parsed.data.name,
    abbreviation: parsed.data.abbreviation,
    timezone: parsed.data.timezone,
  });
  return NextResponse.json(store, { status: 201 });
});
