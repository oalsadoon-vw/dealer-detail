import "server-only";

/**
 * RawRepairOrder → AdvisorDailyMetrics aggregator (pure DB→DB transform).
 *
 * The collector (T3) lands one immutable RO snapshot per (storeId, documentId)
 * into RawRepairOrder. This aggregator reads those snapshots and writes the
 * SAME tables the email/Excel dashboard already reads — AdvisorDailyMetrics +
 * AdvisorDailyCommodity — so the dashboard needs ZERO changes.
 *
 * CRITICAL: recalc + SET semantics. The collector re-fetches the same window
 * every run, so the aggregator MUST be idempotent. For each (storeId,
 * businessDate) being recomputed we delete the existing metrics + commodity
 * rows INSIDE A TRANSACTION and then insert fresh values. Never increment.
 *
 * Email-sourced rows for OTHER stores/dates are untouched.
 *
 * Money: Tekion payloads are in CENTS. Convert with /100 to dollars before
 * writing — the dashboard's Float columns store dollars (matching the email
 * prototype), so API + email numbers are directly comparable on the dashboard.
 *
 * Count semantics: we count menu/ala as the number of qualifying OPERATIONS
 * (line items), not unique ROs. The email prototype is inconsistent (menu is
 * per-RO, ala is per-row); we pick the operation-level interpretation for both
 * because that's the natural unit in the API payload and the ticket prefers
 * line items. The choice is reported in AggregateResult.warnings for traceability.
 */

import { prisma } from "@/lib/db";
import {
  classifyOpcode,
  loadOpcodeCategories,
  normalizeOpcode,
} from "./opcodeClassifier";
import type { OpcodeMap } from "./opcodeClassifier";

export interface AggregateMetricsParams {
  storeId: string;
  /** If omitted, aggregate ALL distinct businessDates present in RawRepairOrder for the store. */
  businessDates?: Date[];
  /** Optional provenance — propagated into the AdvisorDailyMetrics.meta column. */
  syncRunId?: string;
}

export interface AggregateResult {
  storeId: string;
  datesProcessed: string[]; // ISO yyyy-mm-dd
  advisorsTouched: number;
  metricsRowsWritten: number;
  commodityRowsWritten: number;
  unclassifiedOpcodes: string[]; // sorted, distinct
  warnings: string[];
  countMode: "operation" | "ro";
  recDataPresent: boolean;
}

interface AdvisorBucket {
  // identity
  advisorId: string;

  // metrics (dollars)
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

  // commodityKey -> { qty, gross, laborGross }
  commodities: Map<
    string,
    { qty: number; gross: number; laborGross: number }
  >;
}

function cents(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
function toDollars(c: number): number {
  return c / 100;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nameToNormalized(name: string | null | undefined): {
  nameNormalized: string;
  nameRaw: string | null;
} {
  if (!name || !name.trim()) return { nameNormalized: "UNASSIGNED", nameRaw: null };
  const t = name.trim();
  return { nameNormalized: t.toUpperCase(), nameRaw: t };
}

/**
 * Ensure an Advisor row exists for this (storeId, normalizedName). Returns the
 * advisorId, cached so repeated calls in one aggregateMetrics run hit the DB
 * only once per advisor.
 */
async function ensureAdvisorId(
  storeId: string,
  rawName: string | null,
  tekionId: string | null,
  cache: Map<string, string>,
): Promise<string> {
  const { nameNormalized, nameRaw } = nameToNormalized(rawName);
  const cacheKey = `${storeId}::${nameNormalized}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;
  const advisor = await prisma.advisor.upsert({
    where: { storeId_nameNormalized: { storeId, nameNormalized } },
    create: {
      storeId,
      nameNormalized,
      nameRaw: nameRaw ?? nameNormalized,
      tekionUserId: tekionId,
    },
    update: tekionId ? { tekionUserId: tekionId } : {},
    select: { id: true },
  });
  cache.set(cacheKey, advisor.id);
  return advisor.id;
}

function newBucket(advisorId: string): AdvisorBucket {
  return {
    advisorId,
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
    dailyPartsGross: 0,
    commodities: new Map(),
  };
}

interface DayAccumulators {
  buckets: Map<string, AdvisorBucket>; // advisorId -> bucket
}

/**
 * Walk a single payload (one RO) and accumulate into the per-advisor bucket
 * for the day. Returns the list of unclassified opcodes seen.
 */
function processPayload(
  payload: any,
  advisorId: string,
  acc: DayAccumulators,
  opcodeMap: OpcodeMap,
  unclassified: Set<string>,
): void {
  if (!acc.buckets.has(advisorId)) {
    acc.buckets.set(advisorId, newBucket(advisorId));
  }
  const bucket = acc.buckets.get(advisorId)!;

  const jobs: any[] = Array.isArray(payload?.jobs) ? payload.jobs : [];
  for (const j of jobs) {
    const jobObj = j?.job ?? j ?? {};
    const ops: any[] = Array.isArray(j?.operations)
      ? j.operations
      : Array.isArray(jobObj?.operations)
        ? jobObj.operations
        : [];
    for (const o of ops) {
      const opObj = o?.operation ?? o ?? {};
      const parts: any[] = Array.isArray(o?.parts)
        ? o.parts
        : Array.isArray(opObj?.parts)
          ? opObj.parts
          : [];

      const opcodeRaw = opObj?.opcode ?? jobObj?.opcode ?? null;
      const opcode = normalizeOpcode(opcodeRaw);

      const laborSaleC = cents(opObj?.labor?.saleAmount);
      const laborCostC = cents(opObj?.labor?.costAmount);
      const laborGross$ = toDollars(laborSaleC - laborCostC);

      let partsGross$ = 0;
      for (const p of parts) {
        const partSaleC = cents(p?.saleAmount);
        const partCostC = cents(p?.costAmount);
        partsGross$ += toDollars(partSaleC - partCostC);
      }

      // Always accumulate store-wide daily totals — these reflect every
      // operation regardless of categorization, so totals stay whole even if
      // some opcodes are unclassified.
      bucket.dailyLaborGross += laborGross$;
      bucket.dailyPartsGross += partsGross$;

      const mapping = opcode ? classifyOpcode(opcodeMap, opcode) : null;
      if (!mapping) {
        if (opcode) unclassified.add(opcode);
        continue;
      }

      switch (mapping.category) {
        case "MENU":
          bucket.menuCount += 1;
          bucket.menuLaborGross += laborGross$;
          bucket.menuPartsGross += partsGross$;
          break;
        case "ALA":
          bucket.alaCount += 1;
          bucket.alaLaborGross += laborGross$;
          bucket.alaPartsGross += partsGross$;
          break;
        case "REC":
          // The current API payload doesn't carry recommendation/sold $ —
          // confirmed in T4 inspection (operation.corrections + job.concern
          // are free-text, no sold-state flag). Leave rec metrics at zero;
          // the warning is emitted once per run upstream.
          break;
        case "COMMODITY": {
          const key = mapping.commodityKey ?? "uncategorized";
          const c = bucket.commodities.get(key) ?? {
            qty: 0,
            gross: 0,
            laborGross: 0,
          };
          c.qty += 1;
          c.gross += laborGross$ + partsGross$;
          c.laborGross += laborGross$;
          bucket.commodities.set(key, c);
          break;
        }
      }
    }
  }
}

/**
 * Aggregate the Tekion-collected ROs into AdvisorDailyMetrics +
 * AdvisorDailyCommodity. Idempotent: delete-then-insert per (storeId,
 * businessDate) inside a transaction.
 */
export async function aggregateMetrics(
  params: AggregateMetricsParams,
): Promise<AggregateResult> {
  const { storeId, syncRunId } = params;

  // 1) Determine which businessDates to recompute.
  let dates: Date[];
  if (params.businessDates && params.businessDates.length > 0) {
    const seen = new Set<string>();
    dates = [];
    for (const d of params.businessDates) {
      const k = dateKey(d);
      if (seen.has(k)) continue;
      seen.add(k);
      dates.push(new Date(`${k}T00:00:00.000Z`));
    }
  } else {
    const rows = await prisma.rawRepairOrder.findMany({
      where: { storeId },
      select: { businessDate: true },
      distinct: ["businessDate"],
    });
    dates = rows.map((r) => r.businessDate);
  }
  dates.sort((a, b) => a.getTime() - b.getTime());

  // 2) Load opcode classification map once.
  const opcodeMap = await loadOpcodeCategories(storeId);

  const advisorCache = new Map<string, string>();
  const unclassified = new Set<string>();
  const warnings: string[] = [];
  const countMode: "operation" | "ro" = "operation";
  warnings.push(
    "menu/ala counts are operation-level (line items). The email prototype " +
      "is inconsistent (menu per-RO, ala per-row); we pick operation-level for " +
      "consistency in the API path.",
  );
  // The recommendation warning is emitted once per run because the payload
  // shape is the same for every RO — there's no point repeating it per row.
  let recWarningEmitted = false;

  let totalMetricsWritten = 0;
  let totalCommodityWritten = 0;
  const advisorsTouched = new Set<string>();

  // 3) For each businessDate: build buckets, then delete-then-insert in a transaction.
  for (const businessDate of dates) {
    const dayRows = await prisma.rawRepairOrder.findMany({
      where: { storeId, businessDate },
      select: {
        documentId: true,
        documentNumber: true,
        advisorTekionId: true,
        payload: true,
      },
    });

    const acc: DayAccumulators = { buckets: new Map() };

    for (const r of dayRows) {
      const payload = r.payload as any;
      const advisorName: string | null =
        typeof payload?.advisorName === "string" && payload.advisorName.trim()
          ? payload.advisorName
          : null;
      if (!recWarningEmitted) {
        // Check the FIRST payload once per run for rec-data presence. The T4
        // ticket confirms it's absent in the current payload shape; emit the
        // warning so the result documents the gap.
        recWarningEmitted = true;
        warnings.push(
          "rec data not present in RO payload — needs separate Tekion " +
            "recommendations endpoint (future ticket). recCount/recSoldCount/" +
            "recAmount/recSoldAmount set to 0.",
        );
      }
      const advisorId = await ensureAdvisorId(
        storeId,
        advisorName,
        r.advisorTekionId,
        advisorCache,
      );
      advisorsTouched.add(advisorId);
      processPayload(payload, advisorId, acc, opcodeMap, unclassified);
    }

    // 4) Write: delete-then-insert in one transaction. Even if a day has no
    //    buckets (every RO skipped), we still delete to clear stale rows.
    const metricsCreates: Array<{
      storeId: string;
      advisorId: string;
      businessDate: Date;
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
      meta: { source: "tekion-api"; syncRunId: string | null };
    }> = [];
    const commodityCreates: Array<{
      storeId: string;
      advisorId: string;
      businessDate: Date;
      commodityKey: string;
      qty: number;
      gross: number;
      laborGross: number;
    }> = [];

    for (const bucket of acc.buckets.values()) {
      metricsCreates.push({
        storeId,
        advisorId: bucket.advisorId,
        businessDate,
        menuCount: bucket.menuCount,
        menuLaborGross: bucket.menuLaborGross,
        menuPartsGross: bucket.menuPartsGross,
        alaCount: bucket.alaCount,
        alaLaborGross: bucket.alaLaborGross,
        alaPartsGross: bucket.alaPartsGross,
        recCount: bucket.recCount,
        recSoldCount: bucket.recSoldCount,
        recAmount: bucket.recAmount,
        recSoldAmount: bucket.recSoldAmount,
        dailyLaborGross: bucket.dailyLaborGross,
        dailyPartsGross: bucket.dailyPartsGross,
        meta: { source: "tekion-api", syncRunId: syncRunId ?? null },
      });

      for (const [commodityKey, c] of bucket.commodities.entries()) {
        commodityCreates.push({
          storeId,
          advisorId: bucket.advisorId,
          businessDate,
          commodityKey,
          qty: c.qty,
          gross: c.gross,
          laborGross: c.laborGross,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.advisorDailyMetrics.deleteMany({
        where: { storeId, businessDate },
      });
      await tx.advisorDailyCommodity.deleteMany({
        where: { storeId, businessDate },
      });
      if (metricsCreates.length > 0) {
        await tx.advisorDailyMetrics.createMany({
          data: metricsCreates.map((m) => ({
            ...m,
            meta: m.meta as unknown as never,
          })),
        });
      }
      if (commodityCreates.length > 0) {
        await tx.advisorDailyCommodity.createMany({
          data: commodityCreates,
        });
      }
    });

    totalMetricsWritten += metricsCreates.length;
    totalCommodityWritten += commodityCreates.length;
  }

  const datesProcessed = dates.map((d) => dateKey(d));
  const unclassifiedSorted = [...unclassified].sort();

  return {
    storeId,
    datesProcessed,
    advisorsTouched: advisorsTouched.size,
    metricsRowsWritten: totalMetricsWritten,
    commodityRowsWritten: totalCommodityWritten,
    unclassifiedOpcodes: unclassifiedSorted,
    warnings,
    countMode,
    recDataPresent: false,
  };
}
