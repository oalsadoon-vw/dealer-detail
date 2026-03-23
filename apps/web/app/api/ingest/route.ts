import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { sha256Hex, stableJsonStringify } from "@/lib/hash";
import { applyParsedResult, createAccumulator, parseExcelFile } from "@/lib/parsing";

export const runtime = "nodejs";

const IngestSchema = z.object({
  storeId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function parseBusinessDate(dateStr: string): Date {
  // Store as a date (midnight UTC) for uniqueness.
  return new Date(`${dateStr}T00:00:00.000Z`);
}

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

    const bizDate = parseBusinessDate(parsedInput.data.businessDate);

    // Always create a new run per upload batch (even if same store + businessDate).
    // Assign a per-store increasing batchNo.
    let run: { id: string; batchNo: number; storeId: string; businessDate: Date } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        run = await prisma.$transaction(async (tx) => {
          const agg = await tx.ingestionRun.aggregate({
            where: { storeId: parsedInput.data.storeId },
            _max: { batchNo: true }
          });
          const nextBatchNo = (agg._max.batchNo ?? 0) + 1;
          const created = await tx.ingestionRun.create({
            data: {
              storeId: parsedInput.data.storeId,
              businessDate: bizDate,
              batchNo: nextBatchNo,
              status: "PROCESSING"
            },
            select: { id: true, batchNo: true, storeId: true, businessDate: true }
          });
          return created;
        });
        break;
      } catch (e: any) {
        // Retry on possible race for (storeId, batchNo) unique constraint.
        if (e?.code === "P2002") continue;
        throw e;
      }
    }
    if (!run) throw new Error("Failed to allocate batch number for ingestion run.");

    const acc = createAccumulator();
    const fileSummaries: Array<Record<string, unknown>> = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const sha = sha256Hex(buf);

      // Skip duplicates across the same store+businessDate (prevents double-counting across batches).
      const existing = await prisma.ingestedFile.findFirst({
        where: { storeId: parsedInput.data.storeId, businessDate: bizDate, sha256: sha },
        select: { id: true }
      });
      if (existing) {
        warnings.push(`Skipped duplicate file '${file.name}' (already ingested for this store/date)`);
        fileSummaries.push({
          filename: file.name,
          sha256: sha,
          skipped: true,
          reason: "duplicate_for_store_date"
        });
        continue;
      }

      let parsedFile: ReturnType<typeof parseExcelFile> | null = null;
      let parseErr: unknown = null;
      try {
        parsedFile = parseExcelFile({ buffer: buf, filename: file.name });
        if (parsedFile.parsed.type !== "unknown") {
          applyParsedResult(acc, parsedFile.parsed);
        } else {
          warnings.push(`Unknown/unsupported file '${file.name}': ${parsedFile.parsed.data.reason}`);
        }
      } catch (e) {
        parseErr = e;
        errors.push(`Failed parsing '${file.name}': ${String(e)}`);
      }

      const ingested = await prisma.ingestedFile.create({
        data: {
          runId: run.id,
          storeId: parsedInput.data.storeId,
          businessDate: bizDate,
          originalFilename: file.name,
          sha256: sha,
          byteSize: buf.byteLength,
          detectedType: parsedFile?.detect.type ?? null,
          detectionConfidence: parsedFile?.detect.confidence ?? null,
          rawMeta: parsedFile
            ? {
              sheetNames: parsedFile.raw.sheetNames,
              usedSheetName: parsedFile.raw.usedSheetName,
              rangeStartRow: parsedFile.raw.rangeStartRow,
              headers: parsedFile.raw.headers,
              detectNotes: parsedFile.detect.notes
            }
            : { error: "parse_failed" },
          parseWarnings: (parsedFile?.parsed.type === "unknown" ? parsedFile.parsed.data : undefined) as any,
          parseErrors: parseErr ? { message: String(parseErr) } : undefined
        }
      });

      // Raw rows always stored (when we have rows).
      if (parsedFile?.rows) {
        // Batch insert for speed (chunked)
        const rows = parsedFile.rows;
        const createMany = rows.map((r, idx) => {
          const rowHash = sha256Hex(stableJsonStringify(r));
          return {
            storeId: parsedInput.data.storeId,
            runId: run.id,
            ingestedFileId: ingested.id,
            businessDate: bizDate,
            rowIndex: idx,
            rowHash,
            data: r
          };
        });

        const chunkSize = 1000;
        for (let i = 0; i < createMany.length; i += chunkSize) {
          const chunk = createMany.slice(i, i + chunkSize);
          await prisma.rawReportRow.createMany({ data: chunk as any });
        }
      }

      fileSummaries.push({
        filename: file.name,
        sha256: sha,
        detectedType: parsedFile?.detect.type ?? "unknown",
        confidence: parsedFile?.detect.confidence ?? 0,
        rows: parsedFile?.raw.rowCount ?? 0
      });
    }

    // Upsert advisors
    const advisorIdsByName = new Map<string, string>();
    for (const nameNormalized of acc.advisors) {
      const advisor = await prisma.advisor.upsert({
        where: { storeId_nameNormalized: { storeId: parsedInput.data.storeId, nameNormalized } },
        update: {},
        create: { storeId: parsedInput.data.storeId, nameNormalized, nameRaw: nameNormalized }
      });
      advisorIdsByName.set(nameNormalized, advisor.id);
    }

    const touchedAdvisors = [...advisorIdsByName.keys()];

    // Upsert advisor daily metrics (additive)
    for (const [name, advisorId] of advisorIdsByName.entries()) {
      const data = {
        openRos: acc.openRos[name] ?? 0,
        menuCount: acc.menuCount[name] ?? 0,
        menuLaborGross: acc.menuLaborGross[name] ?? 0,
        menuPartsGross: acc.menuPartsGross[name] ?? 0,
        alaCount: acc.alaCount[name] ?? 0,
        alaLaborGross: acc.alaLaborGross[name] ?? 0,
        alaPartsGross: acc.alaPartsGross[name] ?? 0,
        recCount: acc.recCount[name] ?? 0,
        recSoldCount: acc.recSoldCount[name] ?? 0,
        recAmount: acc.recAmount[name] ?? 0,
        recSoldAmount: acc.recSoldAmount[name] ?? 0,
        dailyLaborGross: acc.dailyLaborGross[name] ?? 0,
        dailyPartsGross: acc.dailyPartsGross[name] ?? 0
      };

      // Only create/update if any field is non-zero (appeared in at least one supported file)
      const any = Object.values(data).some((v) => v !== 0);
      if (!any) continue;

      await prisma.advisorDailyMetrics.upsert({
        where: {
          storeId_advisorId_businessDate: {
            storeId: parsedInput.data.storeId,
            advisorId,
            businessDate: bizDate
          }
        },
        create: {
          storeId: parsedInput.data.storeId,
          advisorId,
          businessDate: bizDate,
          ...data
        },
        update: {
          openRos: { increment: data.openRos },
          menuCount: { increment: data.menuCount },
          menuLaborGross: { increment: data.menuLaborGross },
          menuPartsGross: { increment: data.menuPartsGross },
          alaCount: { increment: data.alaCount },
          alaLaborGross: { increment: data.alaLaborGross },
          alaPartsGross: { increment: data.alaPartsGross },
          recCount: { increment: data.recCount },
          recSoldCount: { increment: data.recSoldCount },
          recAmount: { increment: data.recAmount },
          recSoldAmount: { increment: data.recSoldAmount },
          dailyLaborGross: { increment: data.dailyLaborGross },
          dailyPartsGross: { increment: data.dailyPartsGross }
        }
      });
    }

    // Upsert commodities (additive)
    for (const [commodityKey, byAdvisor] of Object.entries(acc.commodities)) {
      for (const [advName, qty] of Object.entries(byAdvisor.qty)) {
        const advisorId = advisorIdsByName.get(advName);
        if (!advisorId) continue;
        const gross = byAdvisor.gross[advName] ?? 0;
        const laborGross = byAdvisor.laborGross[advName] ?? 0;
        const any = qty !== 0 || gross !== 0;
        if (!any) continue;

        await prisma.advisorDailyCommodity.upsert({
          where: {
            storeId_advisorId_businessDate_commodityKey: {
              storeId: parsedInput.data.storeId,
              advisorId,
              businessDate: bizDate,
              commodityKey
            }
          },
          create: {
            storeId: parsedInput.data.storeId,
            advisorId,
            businessDate: bizDate,
            commodityKey,
            qty,
            gross,
            laborGross
          },
          update: {
            qty: { increment: qty },
            gross: { increment: gross },
            laborGross: { increment: laborGross }
          }
        });
      }
    }

    const runSummary = {
      runId: run.id,
      batchNo: run.batchNo,
      storeId: parsedInput.data.storeId,
      businessDate: parsedInput.data.businessDate,
      filesIngested: fileSummaries,
      advisorsAffected: touchedAdvisors.length,
      warnings,
      errors
    };

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: errors.length ? "FAILED" : warnings.length ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
        warnings,
        errors,
        summary: runSummary as any
      }
    });

    return NextResponse.json(runSummary);
  } catch (e) {
    // Ensure the client ALWAYS gets JSON (prevents "Unexpected end of JSON input").
    return NextResponse.json(
      { error: "Ingest failed", details: String(e) },
      { status: 500 }
    );
  }
}


