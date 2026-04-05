import { NextResponse } from "next/server";
import { z } from "zod";

import { ingestFiles } from "@/lib/ingest";

export const runtime = "nodejs";

const IngestSchema = z.object({
  storeId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const storeId = form.get("storeId");
    const businessDate = form.get("businessDate");
    const parsedInput = IngestSchema.safeParse({ storeId, businessDate });
    if (!parsedInput.success) {
      return NextResponse.json({ error: "Invalid input", details: parsedInput.error.flatten() }, { status: 400 });
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const fileBuffers = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        buffer: Buffer.from(await f.arrayBuffer())
      }))
    );

    const result = await ingestFiles({
      storeId: parsedInput.data.storeId,
      businessDate: parsedInput.data.businessDate,
      files: fileBuffers
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: "Ingest failed", details: String(e) },
      { status: 500 }
    );
  }
}
