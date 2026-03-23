import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stores = await prisma.store.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json(stores);
  } catch (e) {
    console.error("Failed to fetch stores:", e);
    return NextResponse.json({ error: "Failed to fetch stores", details: String(e) }, { status: 500 });
  }
}

const CreateStoreSchema = z.object({
  name: z.string().min(1),
  abbreviation: z.string().optional(),
  timezone: z.string().optional()
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateStoreSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const store = await prisma.store.create({
      data: {
        name: parsed.data.name,
        timezone: parsed.data.timezone,
        abbreviation: parsed.data.abbreviation ? parsed.data.abbreviation.trim().toUpperCase() : null
      }
    });
    return NextResponse.json(store, { status: 201 });
  } catch (e: any) {
    console.error("Failed to create store:", e);
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Store with this abbreviation already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal server error", details: String(e) }, { status: 500 });
  }
}


