import "server-only";

/**
 * Tekion repair-order collector.
 *
 * Pulls every RO in a [windowStart, windowEnd) window (filtered by creationTime
 * or modifiedTime), fans out to jobs -> operations -> parts, resolves the
 * advisor name, computes a stable contentHash, and UPSERTs one immutable
 * snapshot per RO into RawRepairOrder. The whole pull is wrapped in a SyncRun
 * record for observability and idempotency tracking.
 *
 * Idempotency: (storeId, documentId) is the unique key on RawRepairOrder. On a
 * second run over the same window we only WRITE when contentHash changes; rows
 * with matching hash are counted as "unchanged" and skipped. The row count
 * therefore does not grow on a no-op re-run.
 *
 * Fan-out concurrency is bounded (default 5) on top of the HTTP token-bucket
 * limiter to avoid bursting Tekion's 1500-call / 15-min window.
 */

import { prisma } from "@/lib/db";
import { sha256Hex, stableJsonStringify } from "@/lib/hash";
import {
  TekionApiError,
  TekionClient,
  TekionRateLimitError,
} from "./client";
import { getAdvisorResolver } from "./advisors";
import type { AdvisorResolver, GetAdvisorResolverOptions } from "./advisors";
import type {
  Job,
  Operation,
  Part,
  RepairOrder,
  RepairOrderSnapshot,
  RoVehicle,
  SearchFilter,
} from "./types";

export type SyncRunKind = "FULL_BACKFILL" | "INCREMENTAL" | "MANUAL";
export type SyncRunStatus =
  | "RUNNING"
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "FAILED";

export interface CollectRepairOrdersParams {
  storeId: string;
  tekionDealerId: string;
  windowStart: Date;
  windowEnd: Date;
  kind: SyncRunKind;
  /** Field to filter the window by. Default: "creationTime". INCREMENTAL runs
   *  may pass "modifiedTime" once T6 wires that up. */
  dateField?: "creationTime" | "modifiedTime";
  /** Per-RO fan-out concurrency. Default 5; spec recommends 4-6. */
  concurrency?: number;
  /** Override the Tekion client (testing). */
  client?: TekionClient;
  /** Override the advisor resolver (testing). */
  advisorResolver?: AdvisorResolver;
  /** Extra opts forwarded to getAdvisorResolver when no resolver is passed. */
  advisorResolverOptions?: GetAdvisorResolverOptions;
}

export interface CollectWarning {
  documentId: string | null;
  documentNumber?: string | null;
  message: string;
}

export interface CollectResult {
  syncRunId: string;
  status: SyncRunStatus;
  rosFetched: number;
  created: number;
  updated: number;
  unchanged: number;
  advisorsResolved: number;
  apiCallCount: number;
  warnings: CollectWarning[];
}

const DEFAULT_CONCURRENCY = 5;

/** Truncate a Date to midnight UTC. Returns a fresh Date. */
export function toBusinessDateUtc(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** Build the search filter for a [start, end) window on a date field. */
export function buildRoSearchFilters(
  windowStart: Date,
  windowEnd: Date,
  dateField: "creationTime" | "modifiedTime" = "creationTime",
): SearchFilter[] {
  const startMs = String(windowStart.getTime());
  // The Tekion search bound is inclusive on both sides; we emulate exclusive
  // upper by subtracting 1ms from windowEnd.
  const endMs = String(windowEnd.getTime() - 1);
  return [{ field: dateField, operator: "BTW", values: [startMs, endMs] }];
}

function pickJobId(job: Job): string | null {
  const id = job.id ?? job.documentId ?? (job as { jobId?: string }).jobId;
  return typeof id === "string" && id ? id : null;
}

function pickOperationId(op: Operation): string | null {
  const id = op.id ?? op.documentId;
  return typeof id === "string" && id ? id : null;
}

function pickVin(ro: RepairOrder): string | null {
  const v = ro.vehicle as { vin?: string | null } | null | undefined;
  return typeof v?.vin === "string" && v.vin ? v.vin : null;
}

function deriveBusinessDate(ro: RepairOrder): Date {
  const closed = ro.closedTime ?? ro.invoicedTime ?? null;
  const open = ro.creationTime ?? null;
  const base = closed ?? open ?? Date.now();
  return toBusinessDateUtc(new Date(base));
}

function epochToDate(ms: number | null | undefined): Date | null {
  return typeof ms === "number" && ms > 0 ? new Date(ms) : null;
}

function readPayType(ro: RepairOrder): string | null {
  // Tekion's RO has a `type` field on the search payload; if missing, look for
  // a tag with field "payType". We persist whatever string is there; the
  // aggregator (T4) is responsible for canonicalising.
  if (typeof ro.type === "string" && ro.type) return ro.type;
  const tags = ro.tags ?? [];
  for (const t of tags) {
    if (t && typeof t.field === "string" && t.field.toLowerCase() === "paytype") {
      return typeof t.value === "string" ? t.value : null;
    }
  }
  return null;
}

function normalizeAdvisorKey(name: string | null): {
  nameNormalized: string;
  nameRaw: string | null;
} {
  if (!name || !name.trim()) {
    return { nameNormalized: "UNASSIGNED", nameRaw: null };
  }
  const trimmed = name.trim();
  return { nameNormalized: trimmed.toUpperCase(), nameRaw: trimmed };
}

interface InternalCounters {
  apiCallCount: number;
  created: number;
  updated: number;
  unchanged: number;
  advisorsResolved: number;
  rosFetched: number;
  warnings: CollectWarning[];
}

/**
 * Run an async worker over a list of items with bounded concurrency. Worker
 * exceptions are caught and pushed into the warnings list so a single bad RO
 * cannot abort the whole run.
 */
async function pMap<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const runOne = async (): Promise<void> => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      await worker(items[i]!);
    }
  };
  const lanes = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => runOne(),
  );
  await Promise.all(lanes);
}

export async function collectRepairOrders(
  params: CollectRepairOrdersParams,
): Promise<CollectResult> {
  const {
    storeId,
    tekionDealerId,
    windowStart,
    windowEnd,
    kind,
    dateField = "creationTime",
    concurrency = DEFAULT_CONCURRENCY,
  } = params;

  if (!(windowStart instanceof Date) || isNaN(windowStart.getTime())) {
    throw new Error("collectRepairOrders: windowStart must be a valid Date");
  }
  if (!(windowEnd instanceof Date) || isNaN(windowEnd.getTime())) {
    throw new Error("collectRepairOrders: windowEnd must be a valid Date");
  }
  if (windowEnd.getTime() <= windowStart.getTime()) {
    throw new Error("collectRepairOrders: windowEnd must be after windowStart");
  }

  const client = params.client ?? new TekionClient();
  const resolver =
    params.advisorResolver ??
    getAdvisorResolver({
      dealerId: tekionDealerId,
      ...(params.advisorResolverOptions ?? {}),
    });

  const syncRun = await prisma.syncRun.create({
    data: {
      storeId,
      kind,
      windowStart,
      windowEnd,
      status: "RUNNING",
    },
  });

  const counters: InternalCounters = {
    apiCallCount: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    advisorsResolved: 0,
    rosFetched: 0,
    warnings: [],
  };

  // De-dupe advisor lookups + Advisor row upserts across concurrent ROs.
  const advisorNamePromises = new Map<string, Promise<string | null>>();
  const advisorUpsertPromises = new Map<string, Promise<string>>();

  async function resolveAdvisorOnce(id: string): Promise<string | null> {
    let p = advisorNamePromises.get(id);
    if (!p) {
      p = (async () => {
        try {
          const name = await resolver.resolve(id);
          counters.apiCallCount += 1;
          if (name) counters.advisorsResolved += 1;
          return name;
        } catch (err) {
          counters.warnings.push({
            documentId: null,
            message: `advisor resolution failed for id=${id}: ${(err as Error).message}`,
          });
          return null;
        }
      })();
      advisorNamePromises.set(id, p);
    }
    return p;
  }

  async function ensureAdvisor(
    advisorTekionId: string | null,
  ): Promise<{ name: string | null; nameNormalized: string }> {
    let resolvedName: string | null = null;
    if (advisorTekionId) {
      resolvedName = await resolveAdvisorOnce(advisorTekionId);
    }
    const { nameNormalized, nameRaw } = normalizeAdvisorKey(resolvedName);
    // Cache Advisor row upserts by the natural identity used in the DB unique
    // key (storeId + nameNormalized), keyed within this run so concurrent ROs
    // don't race the upsert.
    const key = `${nameNormalized}::${advisorTekionId ?? ""}`;
    let p = advisorUpsertPromises.get(key);
    if (!p) {
      p = (async () => {
        const advisor = await prisma.advisor.upsert({
          where: { storeId_nameNormalized: { storeId, nameNormalized } },
          create: {
            storeId,
            nameNormalized,
            nameRaw,
            tekionUserId: advisorTekionId,
          },
          update: advisorTekionId
            ? { tekionUserId: advisorTekionId, ...(nameRaw ? { nameRaw } : {}) }
            : nameRaw
              ? { nameRaw }
              : {},
        });
        return advisor.id;
      })();
      advisorUpsertPromises.set(key, p);
    }
    await p;
    return { name: resolvedName, nameNormalized };
  }

  async function fetchSnapshot(
    ro: RepairOrder,
  ): Promise<{ snapshot: RepairOrderSnapshot; vehicle: RoVehicle | null }> {
    const roId = ro.documentId;
    const jobs = await client.getJobs(tekionDealerId, roId);
    counters.apiCallCount += 1;

    const jobsExpanded: RepairOrderSnapshot["jobs"] = [];
    for (const job of jobs) {
      const jobId = pickJobId(job);
      if (!jobId) {
        jobsExpanded.push({ job, operations: [] });
        continue;
      }
      let ops: Operation[] = [];
      try {
        ops = await client.getOperations(tekionDealerId, roId, jobId);
        counters.apiCallCount += 1;
      } catch (err) {
        counters.warnings.push({
          documentId: roId,
          documentNumber: ro.documentNumber ?? null,
          message: `getOperations failed for job ${jobId}: ${(err as Error).message}`,
        });
        jobsExpanded.push({ job, operations: [] });
        continue;
      }
      const opsExpanded: RepairOrderSnapshot["jobs"][number]["operations"] = [];
      for (const op of ops) {
        const operationId = pickOperationId(op);
        if (!operationId) {
          opsExpanded.push({ operation: op, parts: [] });
          continue;
        }
        let parts: Part[] = [];
        try {
          parts = await client.getParts(
            tekionDealerId,
            roId,
            jobId,
            operationId,
          );
          counters.apiCallCount += 1;
        } catch (err) {
          counters.warnings.push({
            documentId: roId,
            documentNumber: ro.documentNumber ?? null,
            message: `getParts failed for op ${operationId}: ${(err as Error).message}`,
          });
        }
        opsExpanded.push({ operation: op, parts });
      }
      jobsExpanded.push({ job, operations: opsExpanded });
    }

    let vehicle: RoVehicle | null = null;
    const vinFromRo = pickVin(ro);
    if (!vinFromRo) {
      try {
        vehicle = await client.getRoVehicle(tekionDealerId, roId);
        counters.apiCallCount += 1;
      } catch (err) {
        counters.warnings.push({
          documentId: roId,
          documentNumber: ro.documentNumber ?? null,
          message: `getRoVehicle failed: ${(err as Error).message}`,
        });
      }
    }

    return {
      snapshot: {
        ro,
        vehicle,
        jobs: jobsExpanded,
        advisorName: null, // populated after advisor resolution in caller
      },
      vehicle,
    };
  }

  async function processRo(ro: RepairOrder): Promise<void> {
    const documentId = ro.documentId;
    const documentNumber = ro.documentNumber;
    if (!documentId || typeof documentId !== "string") {
      counters.warnings.push({
        documentId: null,
        message: "RO missing documentId — skipped",
      });
      return;
    }
    if (!documentNumber || typeof documentNumber !== "string") {
      counters.warnings.push({
        documentId,
        message: "RO missing documentNumber — skipped",
      });
      return;
    }

    try {
      const advisorTekionId = ro.assignee?.advisor?.id ?? null;
      const { snapshot, vehicle } = await fetchSnapshot(ro);
      const advisor = await ensureAdvisor(advisorTekionId);
      snapshot.advisorName = advisor.name;

      const vin = pickVin(ro) ?? vehicle?.vin ?? null;
      const openDate = epochToDate(ro.creationTime);
      const closeDate =
        epochToDate(ro.closedTime) ?? epochToDate(ro.invoicedTime);
      const businessDate = deriveBusinessDate(ro);
      const payload = snapshot as unknown as Record<string, unknown>;
      const contentHash = sha256Hex(stableJsonStringify(payload));

      const existing = await prisma.rawRepairOrder.findUnique({
        where: { storeId_documentId: { storeId, documentId } },
        select: { id: true, contentHash: true },
      });

      const now = new Date();
      if (!existing) {
        await prisma.rawRepairOrder.create({
          data: {
            storeId,
            syncRunId: syncRun.id,
            documentId,
            documentNumber,
            status: ro.status ?? null,
            payType: readPayType(ro),
            advisorTekionId,
            vin,
            openDate,
            closeDate,
            businessDate,
            payload: payload as never,
            contentHash,
            fetchedAt: now,
          },
        });
        counters.created += 1;
      } else if (existing.contentHash !== contentHash) {
        await prisma.rawRepairOrder.update({
          where: { id: existing.id },
          data: {
            syncRunId: syncRun.id,
            documentNumber,
            status: ro.status ?? null,
            payType: readPayType(ro),
            advisorTekionId,
            vin,
            openDate,
            closeDate,
            businessDate,
            payload: payload as never,
            contentHash,
            fetchedAt: now,
          },
        });
        counters.updated += 1;
      } else {
        counters.unchanged += 1;
      }
    } catch (err) {
      const message =
        err instanceof TekionRateLimitError
          ? `rate-limited after retries: ${err.message}`
          : err instanceof TekionApiError
            ? `Tekion API ${err.status}: ${err.message}`
            : (err as Error).message;
      counters.warnings.push({
        documentId,
        documentNumber: documentNumber ?? null,
        message,
      });
    }
  }

  // -- main collection loop -----------------------------------------------
  let fatalError: Error | null = null;
  try {
    const filters = buildRoSearchFilters(windowStart, windowEnd, dateField);
    // Collect all ROs first (one page = 1 API call). Each page yields up to 50.
    const allRos: RepairOrder[] = [];
    const iter = client.iterateRepairOrders({
      dealerId: tekionDealerId,
      filters,
      pageSize: 50,
    });
    // Count search-page API calls as we iterate: every 50 ROs ~= 1 page.
    let lastBucket = 0;
    for await (const ro of iter) {
      allRos.push(ro);
      const bucket = Math.floor(allRos.length / 50);
      if (bucket !== lastBucket) {
        counters.apiCallCount += 1;
        lastBucket = bucket;
      }
    }
    // Account for the final partial page (and the first page if total < 50).
    if (allRos.length === 0 || allRos.length % 50 !== 0) {
      counters.apiCallCount += 1;
    }
    counters.rosFetched = allRos.length;

    await pMap(allRos, concurrency, processRo);
  } catch (err) {
    fatalError = err as Error;
  }

  const finishedAt = new Date();
  const hasWarnings = counters.warnings.length > 0;
  const status: SyncRunStatus = fatalError
    ? "FAILED"
    : hasWarnings
      ? "COMPLETED_WITH_WARNINGS"
      : "COMPLETED";

  await prisma.syncRun.update({
    where: { id: syncRun.id },
    data: {
      status,
      apiCallCount: counters.apiCallCount,
      rosFetched: counters.rosFetched,
      warnings: counters.warnings.length
        ? (counters.warnings as unknown as never)
        : undefined,
      errors: fatalError
        ? ([{ message: fatalError.message, stack: fatalError.stack ?? null }] as unknown as never)
        : undefined,
      summary: {
        created: counters.created,
        updated: counters.updated,
        unchanged: counters.unchanged,
        advisorsResolved: counters.advisorsResolved,
        warningsCount: counters.warnings.length,
      } as unknown as never,
      finishedAt,
    },
  });

  if (fatalError) throw fatalError;

  return {
    syncRunId: syncRun.id,
    status,
    rosFetched: counters.rosFetched,
    created: counters.created,
    updated: counters.updated,
    unchanged: counters.unchanged,
    advisorsResolved: counters.advisorsResolved,
    apiCallCount: counters.apiCallCount,
    warnings: counters.warnings,
  };
}
