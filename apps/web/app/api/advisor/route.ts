import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const QuerySchema = z.object({
  advisorId: z.string().uuid(),
  storeId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

function parseDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      advisorId: url.searchParams.get("advisorId") ?? undefined,
      storeId: url.searchParams.get("storeId") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }

    const { advisorId, storeId, startDate, endDate } = parsed.data;
    const rangeStart = parseDate(startDate);
    const rangeEnd = parseDate(endDate);
    const dateWhere = { gte: rangeStart, lt: addDays(rangeEnd, 1) };

    const advisor = await prisma.advisor.findUnique({ where: { id: advisorId } });
    if (!advisor) return NextResponse.json({ error: "Advisor not found" }, { status: 404 });

    const metrics = await prisma.advisorDailyMetrics.findMany({
      where: { advisorId, storeId, businessDate: dateWhere }
    });

    const commodities = await prisma.advisorDailyCommodity.findMany({
      where: { advisorId, storeId, businessDate: dateWhere }
    });

    const agg = {
      openRos: 0, menuCount: 0, menuLaborGross: 0, menuPartsGross: 0,
      alaCount: 0, alaLaborGross: 0, alaPartsGross: 0,
      recCount: 0, recSoldCount: 0, recAmount: 0, recSoldAmount: 0,
      dailyLaborGross: 0, dailyPartsGross: 0
    };
    for (const m of metrics) {
      agg.openRos += m.openRos ?? 0;
      agg.menuCount += m.menuCount ?? 0;
      agg.menuLaborGross += m.menuLaborGross ?? 0;
      agg.menuPartsGross += m.menuPartsGross ?? 0;
      agg.alaCount += m.alaCount ?? 0;
      agg.alaLaborGross += m.alaLaborGross ?? 0;
      agg.alaPartsGross += m.alaPartsGross ?? 0;
      agg.recCount += m.recCount ?? 0;
      agg.recSoldCount += m.recSoldCount ?? 0;
      agg.recAmount += m.recAmount ?? 0;
      agg.recSoldAmount += m.recSoldAmount ?? 0;
      agg.dailyLaborGross += m.dailyLaborGross ?? 0;
      agg.dailyPartsGross += m.dailyPartsGross ?? 0;
    }

    const dailyMap = new Map<string, {
      openRos: number; menuCount: number; alaCount: number;
      dailyLaborGross: number; dailyPartsGross: number;
      commodityQty: number; commodityGross: number;
    }>();

    for (const m of metrics) {
      const d = m.businessDate.toISOString().slice(0, 10);
      const prev = dailyMap.get(d) ?? {
        openRos: 0, menuCount: 0, alaCount: 0,
        dailyLaborGross: 0, dailyPartsGross: 0,
        commodityQty: 0, commodityGross: 0
      };
      prev.openRos += m.openRos ?? 0;
      prev.menuCount += m.menuCount ?? 0;
      prev.alaCount += m.alaCount ?? 0;
      prev.dailyLaborGross += m.dailyLaborGross ?? 0;
      prev.dailyPartsGross += m.dailyPartsGross ?? 0;
      dailyMap.set(d, prev);
    }

    for (const c of commodities) {
      const d = c.businessDate.toISOString().slice(0, 10);
      const prev = dailyMap.get(d) ?? {
        openRos: 0, menuCount: 0, alaCount: 0,
        dailyLaborGross: 0, dailyPartsGross: 0,
        commodityQty: 0, commodityGross: 0
      };
      prev.commodityQty += c.qty ?? 0;
      prev.commodityGross += (c.gross ?? 0) + (c.laborGross ?? 0);
      dailyMap.set(d, prev);
    }

    const dailySeries = Array.from(dailyMap.entries())
      .map(([date, v]) => ({
        date,
        openRos: v.openRos,
        menuCount: v.menuCount,
        alaCount: v.alaCount,
        dailyGross: v.dailyLaborGross + v.dailyPartsGross,
        commodityQty: v.commodityQty,
        commodityGross: v.commodityGross
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const commByKey: Record<string, { qty: number; gross: number; laborGross: number }> = {};
    for (const c of commodities) {
      const prev = commByKey[c.commodityKey] ?? { qty: 0, gross: 0, laborGross: 0 };
      prev.qty += c.qty ?? 0;
      prev.gross += c.gross ?? 0;
      prev.laborGross += c.laborGross ?? 0;
      commByKey[c.commodityKey] = prev;
    }

    const commodityMix = Object.entries(commByKey)
      .map(([commodityKey, v]) => ({ commodityKey, ...v }))
      .sort((a, b) => a.commodityKey.localeCompare(b.commodityKey));

    return NextResponse.json({
      advisor: { id: advisor.id, name: advisor.nameNormalized },
      dateRange: { startDate, endDate },
      metrics: agg,
      dailySeries,
      commodityMix
    });
  } catch (e) {
    console.error("Advisor detail query failed:", e);
    return NextResponse.json({ error: "Advisor query failed", details: String(e) }, { status: 500 });
  }
}
