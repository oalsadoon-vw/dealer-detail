import "server-only";

import { prisma } from "@/lib/db";
import { reapStaleRuns } from "../reaper";
import type { CollectResult, CollectWarning, SyncRunKind, SyncRunStatus } from "../collector";
import { RoWriter, epochToDate } from "../persist";
import { BrowserBridge, BrowserNotAuthenticated } from "./browser";
import { JOB_SEARCH_RO_BATCH, RO_SEARCH_PAGE_MAX, TekionInternalClient } from "./client";
import type { InternalRoHeader } from "./client";
import { groupJobsByRo, mapInternalRo } from "./mapper";

/**
 * Collector v2 — Tekion INTERNAL API through the logged-in browser.
 *
 *   ro-search (200/page, modifiedTime ASC)  →  header-first skip  →
 *   job/search for ≤50 changed ROs in ONE call  →  map  →  RoWriter
 *
 * Zero OpenAPI quota. ~25 calls for the worst store-night that cost the
 * OpenAPI path 11,000+. Same SyncRun row contract as collectRepairOrders so
 * the Sync page, reaper and sync-all need no changes.
 *
 * RESUME: SyncRun.cursor = modifiedTime (epoch-ms) of the last header whose
 * batch was fully written. If the previous run for this store on the same
 * window FAILED mid-way, we restart from (cursor − 60s) instead of the window
 * start — a killed run never throws its work away.
 *
 * AUTH: if the browser isn't logged in we throw BrowserNotAuthenticated and
 * mark the run FAILED. We do NOT silently fall back to OpenAPI — that is the
 * pattern that hid three nightly outages.
 */

export interface CollectInternalParams {
  storeId: string;
  /** NUMERIC Tekion dealer id ("1251"). The OpenAPI form is accepted and reduced. */
  tekionDealerId: string;
  windowStart: Date;
  windowEnd: Date;
  kind: SyncRunKind;
  bridge?: BrowserBridge;
  /** Rows per ro-search page (≤200). */
  pageSize?: number;
  /** ROs per job/search batch (≤50). */
  batchSize?: number;
  /** Override for tests. */
  client?: TekionInternalClient;
  /** Called after each batch is written (progress logging). */
  onProgress?: (p: { seen: number; total: number; written: number; skipped: number }) => void;
}

export const RESUME_BACKOFF_MS = 60_000;

/** "americanmotorscorporation_1251_0" → "1251"; "1251" → "1251". */
export function numericDealerId(id: string): string {
  const m = /_(\d+)_\d+$/.exec(id);
  return m ? m[1]! : id;
}

/**
 * Pick a resume point: the newest FAILED run for this store whose window
 * covers ours and that has a cursor. Returns epoch-ms or null.
 */
export async function findResumeCursor(storeId: string, windowStart: Date, windowEnd: Date): Promise<number | null> {
  const prev = await prisma.syncRun.findFirst({
    where: {
      storeId,
      status: "FAILED",
      cursor: { not: null },
      windowStart: { lte: windowStart },
      windowEnd: { gte: new Date(windowStart.getTime() + 1) },
    },
    orderBy: { startedAt: "desc" },
    select: { cursor: true, windowEnd: true, finishedAt: true },
  });
  if (!prev?.cursor) return null;
  const c = Number(prev.cursor);
  if (!Number.isFinite(c) || c <= windowStart.getTime() || c >= windowEnd.getTime()) return null;
  return c;
}

export async function collectRepairOrdersInternal(params: CollectInternalParams): Promise<CollectResult> {
  const { storeId, windowStart, windowEnd, kind } = params;
  const dealerId = numericDealerId(params.tekionDealerId);
  const pageSize = Math.min(params.pageSize ?? RO_SEARCH_PAGE_MAX, RO_SEARCH_PAGE_MAX);
  const batchSize = Math.min(params.batchSize ?? JOB_SEARCH_RO_BATCH, JOB_SEARCH_RO_BATCH);
  if (!(windowStart instanceof Date) || isNaN(windowStart.getTime())) throw new Error("windowStart must be a valid Date");
  if (!(windowEnd instanceof Date) || isNaN(windowEnd.getTime())) throw new Error("windowEnd must be a valid Date");
  if (windowEnd.getTime() <= windowStart.getTime()) throw new Error("windowEnd must be after windowStart");

  const bridge = params.bridge ?? new BrowserBridge();
  const client = params.client ?? new TekionInternalClient(bridge);

  try {
    await reapStaleRuns();
  } catch (err) {
    console.warn(`[collector:internal] reapStaleRuns failed (non-fatal): ${(err as Error).message}`);
  }

  // Resume point BEFORE creating our own run row (so we don't match ourselves).
  const resumeFrom = await findResumeCursor(storeId, windowStart, windowEnd);
  const effectiveStart = resumeFrom ? new Date(Math.max(windowStart.getTime(), resumeFrom - RESUME_BACKOFF_MS)) : windowStart;

  const syncRun = await prisma.syncRun.create({
    data: { storeId, kind, windowStart, windowEnd, status: "RUNNING", cursor: resumeFrom ? String(effectiveStart.getTime()) : null },
  });

  const counters = {
    apiCallCount: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    skippedFanOut: 0,
    rosFetched: 0,
    warnings: [] as CollectWarning[],
    touched: new Set<string>(),
  };
  let lastCursor: number | null = resumeFrom ? effectiveStart.getTime() : null;

  const writer = new RoWriter({
    storeId,
    syncRunId: syncRun.id,
    resolveAdvisor: async (id) => {
      counters.apiCallCount += 1;
      const u = await client.getUser(dealerId, id);
      return { name: u.name, persona: u.persona };
    },
  });

  let finalized = false;
  async function finalize(status: SyncRunStatus, opts: { fatalError?: Error | null; interruptedBy?: string } = {}) {
    if (finalized) return;
    finalized = true;
    const errorsJson = opts.interruptedBy
      ? [{ message: `interrupted by ${opts.interruptedBy}` }]
      : opts.fatalError
        ? [{ message: opts.fatalError.message, name: opts.fatalError.name, stack: opts.fatalError.stack ?? null }]
        : undefined;
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        apiCallCount: counters.apiCallCount,
        rosFetched: counters.rosFetched,
        cursor: lastCursor !== null ? String(lastCursor) : undefined,
        warnings: counters.warnings.length ? (counters.warnings as unknown as never) : undefined,
        errors: errorsJson as unknown as never,
        summary: {
          source: "internal",
          created: counters.created,
          updated: counters.updated,
          unchanged: counters.unchanged,
          skippedFanOut: counters.skippedFanOut,
          advisorsResolved: writer.advisorsResolved,
          warningsCount: counters.warnings.length,
          resumedFrom: resumeFrom ? new Date(effectiveStart).toISOString() : null,
          ...(opts.fatalError instanceof BrowserNotAuthenticated ? { authFailed: true } : {}),
          ...(opts.interruptedBy ? { interruptedBy: opts.interruptedBy } : {}),
        } as unknown as never,
        finishedAt: new Date(),
      },
    });
  }

  const handlers: Partial<Record<NodeJS.Signals, () => void>> = {};
  for (const sig of ["SIGINT", "SIGTERM"] as NodeJS.Signals[]) {
    const h = () => {
      void finalize("FAILED", { interruptedBy: sig })
        .catch((e) => console.error(`[collector:internal] finalize on ${sig} failed:`, (e as Error).message))
        .finally(() => process.exit(130));
    };
    handlers[sig] = h;
    process.on(sig, h);
  }

  async function processBatch(headers: InternalRoHeader[]): Promise<void> {
    if (headers.length === 0) return;
    const hits = await client.jobsForRos(dealerId, headers.map((h) => h.id));
    counters.apiCallCount += 1;
    const byRo = groupJobsByRo(hits);
    for (const h of headers) {
      try {
        const snapshot = mapInternalRo(h, byRo.get(h.id) ?? []);
        if (!snapshot.ro.documentNumber) {
          counters.warnings.push({ documentId: h.id, message: "RO missing roNo — skipped" });
          continue;
        }
        // Sanity: header says N live jobs; if job/search returned fewer, the
        // batch is suspect — warn, still write (facts tolerate), surfaces on Sync page.
        const live = snapshot.jobs.length;
        if (typeof h.nonVoidedJobCount === "number" && h.nonVoidedJobCount > 0 && live < h.nonVoidedJobCount) {
          counters.warnings.push({
            documentId: h.id,
            documentNumber: snapshot.ro.documentNumber,
            message: `job/search returned ${live} live jobs, header says ${h.nonVoidedJobCount}`,
          });
        }
        const advisorId = snapshot.ro.assignee?.advisor?.id ?? null;
        const adv = await writer.ensureAdvisor(advisorId);
        snapshot.advisorName = adv.name;
        snapshot.advisorPersona = adv.persona;
        const r = await writer.write(snapshot, advisorId);
        counters.touched.add(r.businessDate.toISOString());
        if (r.movedFromBusinessDate) counters.touched.add(r.movedFromBusinessDate.toISOString());
        if (r.outcome === "created") counters.created += 1;
        else if (r.outcome === "updated" || r.outcome === "repaired") counters.updated += 1;
        else counters.unchanged += 1;
      } catch (err) {
        counters.warnings.push({ documentId: h.id, documentNumber: h.roNo ?? null, message: (err as Error).message });
      }
    }
    // Batch fully processed → advance the cursor to the newest modifiedTime in it.
    const maxMod = Math.max(...headers.map((h) => Number(h.modifiedTime) || 0));
    if (maxMod > 0) lastCursor = maxMod;
  }

  let fatal: Error | null = null;
  try {
    try {
      await bridge.assertAuthenticated();

      const startMs = effectiveStart.getTime();
      const endMs = windowEnd.getTime() - 1; // inclusive bound → emulate exclusive upper
      let start = 0;
      let total = Infinity;
      let pending: InternalRoHeader[] = [];
      const seenIds = new Set<string>();

      while (start < total) {
        const page = await client.searchRoHeaders(dealerId, startMs, endMs, start, pageSize);
        counters.apiCallCount += 1;
        total = page.total;
        if (page.list.length === 0) break;
        start += page.list.length;

        for (const h of page.list) {
          if (!h?.id || seenIds.has(h.id)) continue; // ASC-by-modifiedTime pages can overlap when rows change mid-scan
          seenIds.add(h.id);
          counters.rosFetched += 1;
          const srcModified = epochToDate(Number(h.modifiedTime) || null);
          const { skip, businessDate } = await writer.isUnchangedByHeader(h.id, srcModified);
          if (skip) {
            counters.unchanged += 1;
            counters.skippedFanOut += 1;
            if (businessDate) counters.touched.add(businessDate.toISOString());
            continue;
          }
          pending.push(h);
          if (pending.length >= batchSize) {
            await processBatch(pending);
            pending = [];
            params.onProgress?.({ seen: counters.rosFetched, total, written: counters.created + counters.updated, skipped: counters.skippedFanOut });
          }
        }
        // A fully-skipped page still advances the cursor (nothing to lose on resume).
        if (pending.length === 0) {
          const maxMod = Math.max(...page.list.map((h) => Number(h.modifiedTime) || 0));
          if (maxMod > (lastCursor ?? 0)) lastCursor = maxMod;
        }
      }
      await processBatch(pending);
      params.onProgress?.({ seen: counters.rosFetched, total: counters.rosFetched, written: counters.created + counters.updated, skipped: counters.skippedFanOut });
    } catch (err) {
      fatal = err as Error;
    }

    const status: SyncRunStatus = fatal ? "FAILED" : counters.warnings.length ? "COMPLETED_WITH_WARNINGS" : "COMPLETED";
    await finalize(status, { fatalError: fatal });
    if (fatal) throw fatal;

    return {
      syncRunId: syncRun.id,
      status,
      rosFetched: counters.rosFetched,
      created: counters.created,
      updated: counters.updated,
      unchanged: counters.unchanged,
      skippedFanOut: counters.skippedFanOut,
      advisorsResolved: writer.advisorsResolved,
      apiCallCount: counters.apiCallCount,
      warnings: counters.warnings,
      touchedBusinessDates: Array.from(counters.touched).sort().map((s) => new Date(s)),
    };
  } finally {
    for (const [sig, h] of Object.entries(handlers)) if (h) process.off(sig as NodeJS.Signals, h);
  }
}
