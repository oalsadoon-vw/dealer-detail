import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/auth/api-guard";
import { requireStoreAccess } from "@/lib/server/authz";

export const runtime = "nodejs";

const QuerySchema = z
  .object({
    runId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .refine(
    (v) =>
      Boolean(v.runId) ||
      (Boolean(v.storeId) && Boolean(v.businessDate)) ||
      (Boolean(v.storeId) && Boolean(v.startDate) && Boolean(v.endDate)),
    { message: "Provide either runId, (storeId + businessDate), or (storeId + startDate + endDate)" }
  );

function parseBusinessDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function daysInclusive(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, days);
}

export const GET = withAuth(async (req, _ctx, tc) => {
  try {
    const url = new URL(req.url);
    const runId = url.searchParams.get("runId") ?? undefined;
    const storeId = url.searchParams.get("storeId");
    const businessDate = url.searchParams.get("businessDate");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const parsed = QuerySchema.safeParse({
      runId,
      storeId: storeId ?? undefined,
      businessDate: businessDate ?? undefined,
      startDate: startDate ?? undefined,
      endDate: endDate ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }

    let store: { id: string; name: string } | null = null;
    let run:
      | (typeof prisma.ingestionRun extends any
        ? any
        : never)
      | null = null;
    let bizDate: Date | null = null;
    let bizDateStr: string | null = null;
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    let range: { startDate: string; endDate: string } | null = null;
    let rangeDays: number | null = null;

    if (parsed.data.runId) {
      run = await prisma.ingestionRun.findUnique({
        where: { id: parsed.data.runId },
        include: { files: true, store: true }
      });
      if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
      store = { id: run.store.id, name: run.store.name };
      bizDate = run.businessDate;
      bizDateStr = run.businessDate.toISOString().slice(0, 10);
    } else {
      store = await prisma.store.findUnique({ where: { id: parsed.data.storeId! } });
      if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

      if (parsed.data.businessDate) {
        bizDateStr = parsed.data.businessDate!;
        bizDate = parseBusinessDate(bizDateStr);
        // Multiple runs can exist for same store/date; pick the latest run for display.
        run = await prisma.ingestionRun.findFirst({
          where: { storeId: parsed.data.storeId!, businessDate: bizDate },
          orderBy: { createdAt: "desc" },
          include: { files: true }
        });
      } else {
        // Date range mode
        range = { startDate: parsed.data.startDate!, endDate: parsed.data.endDate! };
        rangeStart = parseBusinessDate(range.startDate);
        rangeEnd = parseBusinessDate(range.endDate);
        rangeDays = daysInclusive(rangeStart, rangeEnd);
        // inclusive end date: [start, end+1day)
        // For range mode, "run" is not a single run; keep it null.
        run = null;
      }
    }

    requireStoreAccess(tc, store!.id);

    const metrics = await prisma.advisorDailyMetrics.findMany({
      where: range
        ? { storeId: store.id, businessDate: { gte: rangeStart!, lt: addDays(rangeEnd!, 1) } }
        : { storeId: store.id, businessDate: bizDate! },
      include: { advisor: true }
    });

    const commodities = await prisma.advisorDailyCommodity.findMany({
      where: range
        ? { storeId: store.id, businessDate: { gte: rangeStart!, lt: addDays(rangeEnd!, 1) } }
        : { storeId: store.id, businessDate: bizDate! },
      include: { advisor: true }
    });

    const commodityKeys = Array.from(new Set(commodities.map((c) => c.commodityKey))).sort((a, b) => a.localeCompare(b));

    const commoditiesByAdvisor: Record<string, Record<string, { qty: number; gross: number; laborGross: number }>> = {};
    for (const c of commodities) {
      commoditiesByAdvisor[c.advisorId] = commoditiesByAdvisor[c.advisorId] ?? {};
      const prev = commoditiesByAdvisor[c.advisorId][c.commodityKey] ?? { qty: 0, gross: 0, laborGross: 0 };
      commoditiesByAdvisor[c.advisorId][c.commodityKey] = {
        qty: prev.qty + (c.qty ?? 0),
        gross: prev.gross + (c.gross ?? 0),
        laborGross: prev.laborGross + (c.laborGross ?? 0)
      };
    }

    // Aggregate metrics across range (or single day) by advisorId.
    const byAdvisor: Record<
      string,
      {
        advisorId: string;
        advisorName: string;
        metrics: {
          openRos: number;
          menuCount: number;
          menuLaborGross: number;
          menuPartsGross: number;
          alaCount: number;
          alaLaborGross: number;
          alaPartsGross: number;
          recCount: number;
          recSoldCount: number;
          recAmount: number;
          recSoldAmount: number;
          dailyLaborGross: number;
          dailyPartsGross: number;
        };
      }
    > = {};

    for (const m of metrics) {
      const key = m.advisorId;
      byAdvisor[key] = byAdvisor[key] ?? {
        advisorId: m.advisorId,
        advisorName: m.advisor.nameNormalized,
        metrics: {
          openRos: 0,
          menuCount: 0,
          menuLaborGross: 0,
          menuPartsGross: 0,
          alaCount: 0,
          alaLaborGross: 0,
          alaPartsGross: 0,
          recCount: 0,
          recSoldCount: 0,
          recAmount: 0,
          recSoldAmount: 0,
          dailyLaborGross: 0,
          dailyPartsGross: 0
        }
      };
      const t = byAdvisor[key].metrics;
      t.openRos += m.openRos ?? 0;
      t.menuCount += m.menuCount ?? 0;
      t.menuLaborGross += m.menuLaborGross ?? 0;
      t.menuPartsGross += m.menuPartsGross ?? 0;
      t.alaCount += m.alaCount ?? 0;
      t.alaLaborGross += m.alaLaborGross ?? 0;
      t.alaPartsGross += m.alaPartsGross ?? 0;
      t.recCount += m.recCount ?? 0;
      t.recSoldCount += m.recSoldCount ?? 0;
      t.recAmount += m.recAmount ?? 0;
      t.recSoldAmount += m.recSoldAmount ?? 0;
      t.dailyLaborGross += m.dailyLaborGross ?? 0;
      t.dailyPartsGross += m.dailyPartsGross ?? 0;
    }

    // Ensure advisors that only have commodity rows still show up.
    for (const [advisorId, comm] of Object.entries(commoditiesByAdvisor)) {
      if (byAdvisor[advisorId]) continue;
      // Find name from any commodity row
      const anyComm = commodities.find((c) => c.advisorId === advisorId);
      byAdvisor[advisorId] = {
        advisorId,
        advisorName: anyComm?.advisor?.nameNormalized ?? advisorId,
        metrics: {
          openRos: 0,
          menuCount: 0,
          menuLaborGross: 0,
          menuPartsGross: 0,
          alaCount: 0,
          alaLaborGross: 0,
          alaPartsGross: 0,
          recCount: 0,
          recSoldCount: 0,
          recAmount: 0,
          recSoldAmount: 0,
          dailyLaborGross: 0,
          dailyPartsGross: 0
        }
      };
    }

    const advisors = Object.values(byAdvisor)
      .map((a) => ({ ...a, commodities: commoditiesByAdvisor[a.advisorId] ?? {} }))
      .sort((a, b) => a.advisorName.localeCompare(b.advisorName));

    // Series + mix for charts (only meaningful for range mode, but safe for single-day too)
    const dailySeriesRangeWhere = range
      ? { storeId: store.id, businessDate: { gte: rangeStart!, lt: addDays(rangeEnd!, 1) } }
      : { storeId: store.id, businessDate: bizDate! };

    const metricsByDay = await prisma.advisorDailyMetrics.groupBy({
      by: ["businessDate"],
      where: dailySeriesRangeWhere,
      _sum: {
        openRos: true,
        menuCount: true,
        alaCount: true,
        recAmount: true,
        recSoldAmount: true,
        dailyLaborGross: true,
        dailyPartsGross: true
      }
    });

    // NOTE: If Prisma Client hasn't been regenerated after adding `laborGross`,
    // groupBy will throw "Unknown field `laborGross`". We fall back to sums without it.
    let commoditiesByDay: any[] = [];
    try {
      commoditiesByDay = await (prisma.advisorDailyCommodity as any).groupBy({
        by: ["businessDate"],
        where: dailySeriesRangeWhere,
        _sum: { qty: true, gross: true, laborGross: true }
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("Unknown field") && msg.includes("laborGross")) {
        commoditiesByDay = await (prisma.advisorDailyCommodity as any).groupBy({
          by: ["businessDate"],
          where: dailySeriesRangeWhere,
          _sum: { qty: true, gross: true }
        });
      } else {
        throw e;
      }
    }

    let commodityMix: any[] = [];
    try {
      commodityMix = await (prisma.advisorDailyCommodity as any).groupBy({
        by: ["commodityKey"],
        where: dailySeriesRangeWhere,
        _sum: { qty: true, gross: true, laborGross: true }
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("Unknown field") && msg.includes("laborGross")) {
        commodityMix = await (prisma.advisorDailyCommodity as any).groupBy({
          by: ["commodityKey"],
          where: dailySeriesRangeWhere,
          _sum: { qty: true, gross: true }
        });
      } else {
        throw e;
      }
    }

    const commodityByDate = new Map<string, { qty: number; gross: number; laborGross: number }>();
    for (const r of commoditiesByDay) {
      const d = (r.businessDate as Date).toISOString().slice(0, 10);
      commodityByDate.set(d, {
        qty: Number(r._sum.qty ?? 0),
        gross: Number(r._sum.gross ?? 0),
        laborGross: Number(r._sum.laborGross ?? 0)
      });
    }

    const dailySeries = metricsByDay
      .map((r) => {
        const d = (r.businessDate as Date).toISOString().slice(0, 10);
        const dailyLabor = Number(r._sum.dailyLaborGross ?? 0);
        const dailyParts = Number(r._sum.dailyPartsGross ?? 0);
        const comm = commodityByDate.get(d) ?? { qty: 0, gross: 0, laborGross: 0 };
        return {
          date: d,
          openRos: Number(r._sum.openRos ?? 0),
          menuCount: Number(r._sum.menuCount ?? 0),
          alaCount: Number(r._sum.alaCount ?? 0),
          dailyGross: dailyLabor + dailyParts,
          commodityQty: comm.qty,
          commodityGross: comm.gross + comm.laborGross
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      store,
      businessDate: bizDateStr,
      dateRange: range,
      rangeDays,
      run: run
        ? {
          id: run.id,
          batchNo: run.batchNo ?? null,
          status: run.status,
          createdAt: run.createdAt,
          files: run.files.map((f: any) => ({
            id: f.id,
            originalFilename: f.originalFilename,
            detectedType: f.detectedType,
            detectionConfidence: f.detectionConfidence
          }))
        }
        : null,
      commodityKeys,
      advisors,
      dailySeries,
      commodityMix: commodityMix
        .map((r) => ({
          commodityKey: r.commodityKey as string,
          qty: Number(r._sum.qty ?? 0),
          gross: Number(r._sum.gross ?? 0),
          laborGross: Number(r._sum.laborGross ?? 0)
        }))
        .sort((a, b) => a.commodityKey.localeCompare(b.commodityKey))
    });
  } catch (e) {
    return NextResponse.json({ error: "Dashboard query failed", details: String(e) }, { status: 500 });
  }
});


