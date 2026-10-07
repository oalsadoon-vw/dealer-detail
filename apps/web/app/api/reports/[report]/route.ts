import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/auth/api-guard";
import {
  getAdvisorPerformance,
  getFleetRollup,
  getMenuSales,
  getOpcodeExplorer,
  getOpcodeLines,
  getRoList,
  getSummary,
} from "@/lib/server/services/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Base = z.object({
  startDate: Ymd,
  endDate: Ymd,
  basis: z.enum(["opened", "closed"]).default("closed"),
});
const StoreBase = Base.extend({ storeId: z.string().uuid() });

const Schemas = {
  summary: StoreBase,
  advisors: StoreBase,
  menu: StoreBase,
  opcodes: StoreBase.extend({
    opcodes: z.string().optional(), // comma-separated
    search: z.string().optional(),
    category: z.string().optional(),
    commodityKey: z.string().optional(),
  }),
  lines: StoreBase.extend({
    opcodes: z.string().optional(),
    search: z.string().optional(),
    category: z.string().optional(),
    advisorId: z.string().uuid().optional(),
    limit: z.coerce.number().int().positive().max(2000).optional(),
  }),
  ros: StoreBase.extend({
    advisorId: z.string().uuid().optional(),
    status: z.enum(["open", "closed", "all"]).optional(),
    limit: z.coerce.number().int().positive().max(5000).optional(),
  }),
  fleet: Base,
} as const;

type ReportKind = keyof typeof Schemas;

export const GET = withAuth<{ params: { report: string } }>(async (req, ctx, tc) => {
  const { report } = ctx.params;
  if (!(report in Schemas)) {
    return NextResponse.json({ error: `Unknown report '${report}'` }, { status: 404 });
  }
  const kind = report as ReportKind;
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = Schemas[kind].safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }
  const q = parsed.data as any;
  const splitOps = (s?: string) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : undefined);

  try {
    let data: unknown;
    switch (kind) {
      case "summary":  data = await getSummary(tc, q); break;
      case "advisors": data = await getAdvisorPerformance(tc, q); break;
      case "menu":     data = await getMenuSales(tc, q); break;
      case "opcodes":  data = await getOpcodeExplorer(tc, { ...q, opcodes: splitOps(q.opcodes) }); break;
      case "lines":    data = await getOpcodeLines(tc, { ...q, opcodes: splitOps(q.opcodes) }); break;
      case "ros":      data = await getRoList(tc, q); break;
      case "fleet":    data = await getFleetRollup(tc, q); break;
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    return NextResponse.json({ error: "Report query failed", details: String(e) }, { status: 500 });
  }
});
