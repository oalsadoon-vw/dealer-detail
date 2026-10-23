import "server-only";

import { prisma } from "@/lib/db";
import { sha256Hex, stableJsonStringify } from "@/lib/hash";
import type { ResolvedAdvisor } from "./advisors";
import type { RepairOrder, RepairOrderSnapshot } from "./types";

/**
 * Long syncs (hours) hit transient Postgres drops ("Connection reset by peer",
 * Prisma P1001/P1002/P1008/P1017, "connection pool timeout"). Prisma reconnects
 * on the next query, so a short backoff + retry is all that is needed — without
 * it one dropped packet fails a 40k-RO backfill at row 7,439.
 */
const TRANSIENT_DB_RE = /ECONNRESET|Connection reset|P1001|P1002|P1008|P1017|connection pool|Server has closed the connection|terminating connection|Timed out fetching a new connection/i;
export async function withDbRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = `${(err as Error)?.message ?? ""} ${(err as { code?: string })?.code ?? ""}`;
      if (!TRANSIENT_DB_RE.test(msg) || i === attempts - 1) throw err;
      const delay = 1000 * 2 ** i;
      console.warn(`[persist] transient DB error on ${label} (attempt ${i + 1}/${attempts}) — retry in ${delay}ms: ${msg.trim().slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Shared RawRepairOrder writer — used by BOTH collectors (OpenAPI and
 * internal) so the persistence rules (content hash, derived columns,
 * businessDate moves, advisor upsert) live in exactly one place and the two
 * sources cannot drift.
 */

export type WriteOutcome = "created" | "updated" | "repaired" | "unchanged";

export interface RoWriteResult {
  outcome: WriteOutcome;
  businessDate: Date;
  /** The previous businessDate if the RO moved buckets (caller must re-aggregate it too). */
  movedFromBusinessDate: Date | null;
}

export function toBusinessDateUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Statuses that mean the RO is finished (closed or invoiced). */
const TERMINAL_STATUSES = new Set(["CLOSED", "INVOICED"]);

/**
 * Close timestamp. Prefer explicit closedTime/invoicedTime (the internal
 * source always has them); fall back to modifiedTime for terminal ROs (the
 * OpenAPI search payload returns closedTime null — verified 2026-07-01).
 */
export function deriveCloseTime(ro: RepairOrder): number | null {
  const explicit = ro.closedTime ?? ro.invoicedTime ?? null;
  if (typeof explicit === "number" && explicit > 0) return explicit;
  const status = (ro.status ?? "").toUpperCase();
  if (TERMINAL_STATUSES.has(status)) {
    const m = ro.modifiedTime;
    if (typeof m === "number" && m > 0) return m;
  }
  return null;
}

export function deriveBusinessDate(ro: RepairOrder): Date {
  const closed = deriveCloseTime(ro);
  const open = ro.creationTime ?? null;
  const base = closed ?? open ?? Date.now();
  return toBusinessDateUtc(new Date(base));
}

export function epochToDate(ms: number | null | undefined): Date | null {
  return typeof ms === "number" && ms > 0 ? new Date(ms) : null;
}

export function readPayType(ro: RepairOrder): string | null {
  if (typeof ro.type === "string" && ro.type) return ro.type;
  const tags = ro.tags ?? [];
  for (const t of tags) {
    if (t && typeof t.field === "string" && t.field.toLowerCase() === "paytype") {
      return typeof t.value === "string" ? t.value : null;
    }
  }
  return null;
}

export function pickVin(ro: RepairOrder): string | null {
  const v = ro.vehicle as { vin?: string | null } | null | undefined;
  return typeof v?.vin === "string" && v.vin ? v.vin : null;
}

export function normalizeAdvisorKey(name: string | null): { nameNormalized: string; nameRaw: string | null } {
  if (!name || !name.trim()) return { nameNormalized: "UNASSIGNED", nameRaw: null };
  const trimmed = name.trim();
  return { nameNormalized: trimmed.toUpperCase(), nameRaw: trimmed };
}

export interface RoWriterOptions {
  storeId: string;
  syncRunId: string;
  /** Resolve a Tekion user id → name/persona. Called at most once per id per run. */
  resolveAdvisor: (tekionUserId: string) => Promise<ResolvedAdvisor>;
}

export class RoWriter {
  private readonly advisorResolvePromises = new Map<string, Promise<ResolvedAdvisor>>();
  private readonly advisorUpsertPromises = new Map<string, Promise<string>>();
  advisorsResolved = 0;

  constructor(private readonly opts: RoWriterOptions) {}

  private resolveOnce(id: string): Promise<ResolvedAdvisor> {
    let p = this.advisorResolvePromises.get(id);
    if (!p) {
      p = this.opts
        .resolveAdvisor(id)
        .then((r) => {
          if (r.name) this.advisorsResolved += 1;
          return r;
        })
        .catch(() => ({ name: null, persona: null }) as ResolvedAdvisor);
      this.advisorResolvePromises.set(id, p);
    }
    return p;
  }

  /** Upsert the Advisor row; returns {name, persona}. Never clobbers known values with null. */
  async ensureAdvisor(advisorTekionId: string | null): Promise<{ name: string | null; persona: string | null }> {
    let name: string | null = null;
    let persona: string | null = null;
    if (advisorTekionId) {
      const r = await this.resolveOnce(advisorTekionId);
      name = r.name;
      persona = r.persona;
    }
    const { nameNormalized, nameRaw } = normalizeAdvisorKey(name);
    const key = `${nameNormalized}::${advisorTekionId ?? ""}`;
    let p = this.advisorUpsertPromises.get(key);
    if (!p) {
      const storeId = this.opts.storeId;
      p = withDbRetry("advisor.upsert", () =>
        prisma.advisor.upsert({
          where: { storeId_nameNormalized: { storeId, nameNormalized } },
          create: { storeId, nameNormalized, nameRaw, tekionUserId: advisorTekionId, persona },
          update: {
            ...(advisorTekionId ? { tekionUserId: advisorTekionId } : {}),
            ...(nameRaw ? { nameRaw } : {}),
            ...(persona ? { persona } : {}),
          },
        }),
      ).then((a) => a.id);
      // a failed upsert must not poison the cache for the next RO with this advisor
      p.catch(() => this.advisorUpsertPromises.delete(key));
      this.advisorUpsertPromises.set(key, p);
    }
    await p;
    return { name, persona };
  }

  /** Header-first skip test: true if our stored copy already has this modifiedTime. */
  async isUnchangedByHeader(documentId: string, srcModified: Date | null): Promise<{ skip: boolean; businessDate: Date | null }> {
    if (!srcModified) return { skip: false, businessDate: null };
    const prior = await withDbRetry("isUnchangedByHeader", () => prisma.rawRepairOrder.findUnique({
      where: { storeId_documentId: { storeId: this.opts.storeId, documentId } },
      select: { sourceModifiedAt: true, businessDate: true },
    }));
    if (prior?.sourceModifiedAt && prior.sourceModifiedAt.getTime() === srcModified.getTime()) {
      return { skip: true, businessDate: prior.businessDate };
    }
    return { skip: false, businessDate: prior?.businessDate ?? null };
  }

  /** Persist a fully-built snapshot (advisorName/persona already filled). */
  async write(snapshot: RepairOrderSnapshot, advisorTekionId: string | null): Promise<RoWriteResult> {
    const { storeId, syncRunId } = this.opts;
    const ro = snapshot.ro;
    const documentId = ro.documentId;
    const documentNumber = ro.documentNumber as string;
    const srcModified = epochToDate(ro.modifiedTime);
    const vin = pickVin(ro) ?? snapshot.vehicle?.vin ?? null;
    const openDate = epochToDate(ro.creationTime);
    const closeDate = epochToDate(deriveCloseTime(ro));
    const businessDate = deriveBusinessDate(ro);
    const payload = snapshot as unknown as Record<string, unknown>;
    const contentHash = sha256Hex(stableJsonStringify(payload));

    const existing = await withDbRetry("write.findUnique", () => prisma.rawRepairOrder.findUnique({
      where: { storeId_documentId: { storeId, documentId } },
      select: { id: true, contentHash: true, closeDate: true, businessDate: true },
    }));
    const now = new Date();
    const movedFrom =
      existing && existing.businessDate.getTime() !== businessDate.getTime() ? existing.businessDate : null;
    const common = {
      syncRunId,
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
      sourceModifiedAt: srcModified,
      fetchedAt: now,
    };

    if (!existing) {
      await withDbRetry("write.create", () => prisma.rawRepairOrder.create({ data: { storeId, documentId, ...common } }));
      return { outcome: "created", businessDate, movedFromBusinessDate: null };
    }
    if (existing.contentHash !== contentHash) {
      await withDbRetry("write.update", () => prisma.rawRepairOrder.update({ where: { id: existing.id }, data: common }));
      return { outcome: "updated", businessDate, movedFromBusinessDate: movedFrom };
    }
    if ((closeDate && !existing.closeDate) || movedFrom) {
      await withDbRetry("write.repair", () => prisma.rawRepairOrder.update({
        where: { id: existing.id },
        data: { status: ro.status ?? null, closeDate, businessDate, sourceModifiedAt: srcModified, fetchedAt: now },
      }));
      return { outcome: "repaired", businessDate, movedFromBusinessDate: movedFrom };
    }
    await withDbRetry("write.touch", () => prisma.rawRepairOrder.update({ where: { id: existing.id }, data: { sourceModifiedAt: srcModified } }));
    return { outcome: "unchanged", businessDate, movedFromBusinessDate: null };
  }
}
