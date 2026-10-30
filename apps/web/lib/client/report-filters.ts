"use client";

/**
 * Shared filter state for every /reports/* page — store, date range, date
 * basis, statuses and pay types. Persisted in the URL
 * (?store=&start=&end=&basis=&status=&pay=) so links/bookmarks reproduce
 * exactly what a manager was looking at, and switching pages keeps the same
 * filters.
 *
 * "Show everything" semantics (PLAN-show-everything.md D1–D6):
 *   - basis defaults to "activity" (RO opened OR closed in range — the whole
 *     shop), with "closed" and "opened" as explicit alternatives.
 *   - statuses default to every canonical Tekion status EXCEPT VOIDED.
 *   - payClasses default to all four pay types.
 *   - When a dimension is at its default it is OMITTED from the URL/query, so
 *     the server's own default (all non-VOIDED, all pay) matches the client's.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Basis = "activity" | "closed" | "opened";
export type PayClass = "CP" | "W" | "I" | "O";
export type StoreOpt = { id: string; name: string; abbreviation: string | null };

/* ---------------------------------------------------------------------------
 * Canonical status vocabulary (Tekion statuses, see PLAN D4).
 * ------------------------------------------------------------------------- */
export const CLOSED_STATUS = "CLOSED";
export const INVOICED_STATUS = "INVOICED";
export const VOIDED_STATUS = "VOIDED";
/** The "Open" group — RO is in the shop and not yet posted. */
export const OPEN_STATUSES = [
  "READY_FOR_INVOICE",
  "IN_PROGRESS",
  "TECH_ASSIGNED",
  "PARTIALLY_ASSIGNED",
  "UNASSIGNED",
  "HOLD",
] as const;
/** Every canonical status, in display order. */
export const ALL_STATUSES = [
  CLOSED_STATUS,
  INVOICED_STATUS,
  ...OPEN_STATUSES,
  VOIDED_STATUS,
] as const;
/** Default selection — everything except VOIDED (D6). */
export const DEFAULT_STATUSES: string[] = ALL_STATUSES.filter((s) => s !== VOIDED_STATUS);

export const ALL_PAY_CLASSES: PayClass[] = ["CP", "W", "I", "O"];
export const PAY_CLASS_LABEL: Record<PayClass, string> = {
  CP: "CP",
  W: "Warranty",
  I: "Internal",
  O: "Other",
};

function sameSet(a: readonly string[] | string[], b: readonly string[] | string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/** Expand `OPEN` group alias, validate, dedupe and canonicalize order. */
export function parseStatuses(csv: string | null | undefined): string[] {
  if (!csv) return [...DEFAULT_STATUSES];
  const raw = csv
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (raw.length === 0) return [...DEFAULT_STATUSES];
  const expanded = raw.flatMap((t) => (t === "OPEN" ? [...OPEN_STATUSES] : [t]));
  return (ALL_STATUSES as readonly string[]).filter((s) => expanded.includes(s));
}

/** Serialize statuses to a URL/query param — omitted (`""`) when default. */
export function serializeStatuses(statuses: string[]): string {
  if (sameSet(statuses, DEFAULT_STATUSES)) return "";
  return (ALL_STATUSES as readonly string[]).filter((s) => statuses.includes(s)).join(",");
}

export function parsePayClasses(csv: string | null | undefined): PayClass[] {
  if (!csv) return [...ALL_PAY_CLASSES];
  const raw = csv
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t): t is PayClass => (ALL_PAY_CLASSES as string[]).includes(t));
  return ALL_PAY_CLASSES.filter((p) => raw.includes(p));
}

export function serializePayClasses(payClasses: PayClass[]): string {
  if (sameSet(payClasses, ALL_PAY_CLASSES)) return "";
  return ALL_PAY_CLASSES.filter((p) => payClasses.includes(p)).join(",");
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
export function ymd(d: Date) { return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }

/** Today's date in US-Pacific as YYYY-MM-DD (stores are all Pacific). */
export function todayPacific(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function monthStartOf(s: string) { return s.slice(0, 8) + "01"; }
export function addDays(s: string, n: number) {
  const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d);
}
export function prevMonthRange(s: string): { start: string; end: string } {
  const d = new Date(`${s}T00:00:00Z`);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  return { start: ymd(start), end: ymd(end) };
}

export interface ReportFilters {
  storeId: string;
  startDate: string;
  endDate: string;
  basis: Basis;
  /** Included statuses (expanded, canonical — never contains the `OPEN` alias). */
  statuses: string[];
  /** Included pay classes. */
  payClasses: PayClass[];
  set: (patch: Partial<Pick<ReportFilters, "storeId" | "startDate" | "endDate" | "basis" | "statuses" | "payClasses">>) => void;
  query: string; // encoded query string for /api/reports/*
}

function basisFromParam(v: string | null): Basis {
  return v === "closed" || v === "opened" || v === "activity" ? v : "activity";
}

export function useReportFilters(stores: StoreOpt[]): ReportFilters {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = todayPacific();

  const storeId = sp.get("store") && stores.some((s) => s.id === sp.get("store")) ? sp.get("store")! : (stores[0]?.id ?? "");
  const startDate = sp.get("start") ?? monthStartOf(today);
  const endDate = sp.get("end") ?? today;
  const basis: Basis = basisFromParam(sp.get("basis"));
  const statuses = parseStatuses(sp.get("status"));
  const payClasses = parsePayClasses(sp.get("pay"));

  const set = useCallback<ReportFilters["set"]>((patch) => {
    const next = new URLSearchParams(sp.toString());
    const cur = { storeId, startDate, endDate, basis, statuses, payClasses, ...patch };
    next.set("store", cur.storeId);
    next.set("start", cur.startDate);
    next.set("end", cur.endDate);
    next.set("basis", cur.basis);

    const st = serializeStatuses(cur.statuses);
    if (st) next.set("status", st); else next.delete("status");
    const pay = serializePayClasses(cur.payClasses);
    if (pay) next.set("pay", pay); else next.delete("pay");

    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [sp, router, pathname, storeId, startDate, endDate, basis, statuses, payClasses]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ storeId, startDate, endDate, basis });
    const st = serializeStatuses(statuses);
    if (st) q.set("status", st);
    const pay = serializePayClasses(payClasses);
    if (pay) q.set("pay", pay);
    return q.toString();
  }, [storeId, startDate, endDate, basis, statuses, payClasses]);

  return { storeId, startDate, endDate, basis, statuses, payClasses, set, query };
}

/** Preserve the current filters when linking between report pages. */
export function reportHref(
  path: string,
  f: Pick<ReportFilters, "storeId" | "startDate" | "endDate" | "basis" | "statuses" | "payClasses">,
) {
  const q = new URLSearchParams({ store: f.storeId, start: f.startDate, end: f.endDate, basis: f.basis });
  const st = serializeStatuses(f.statuses);
  if (st) q.set("status", st);
  const pay = serializePayClasses(f.payClasses);
  if (pay) q.set("pay", pay);
  return `${path}?${q.toString()}`;
}

/**
 * Query string for GL-backed reports (`/api/reports/financials`) — store +
 * range only. RO-scoped filters (basis/status/pay) do not apply to the GL and
 * must be omitted so the cache key stays stable.
 */
export function glQuery(f: Pick<ReportFilters, "storeId" | "startDate" | "endDate">): string {
  return new URLSearchParams({ storeId: f.storeId, startDate: f.startDate, endDate: f.endDate }).toString();
}

/* ---------------------------------------------------------------------------
 * Presets + default helpers.
 * ------------------------------------------------------------------------- */

export interface FilterPreset {
  id: "everything" | "posted" | "open" | "invoiced";
  label: string;
  patch: Partial<Pick<ReportFilters, "basis" | "statuses" | "payClasses">>;
}

/** The four one-click "view" chips in the filter bar (PLAN B2). */
export const presets: FilterPreset[] = [
  { id: "everything", label: "Everything", patch: { basis: "activity", statuses: [...DEFAULT_STATUSES], payClasses: [...ALL_PAY_CLASSES] } },
  { id: "posted", label: "Posted only — ties to financials", patch: { basis: "closed", statuses: [CLOSED_STATUS], payClasses: [...ALL_PAY_CLASSES] } },
  { id: "open", label: "Open work (WIP)", patch: { basis: "activity", statuses: [...OPEN_STATUSES], payClasses: [...ALL_PAY_CLASSES] } },
  { id: "invoiced", label: "Invoiced, not posted", patch: { basis: "activity", statuses: [INVOICED_STATUS], payClasses: [...ALL_PAY_CLASSES] } },
];

export function activePreset(f: Pick<ReportFilters, "basis" | "statuses" | "payClasses">): FilterPreset | null {
  return presets.find((p) =>
    p.patch.basis === f.basis &&
    sameSet(p.patch.statuses ?? DEFAULT_STATUSES, f.statuses) &&
    sameSet(p.patch.payClasses ?? ALL_PAY_CLASSES, f.payClasses),
  ) ?? null;
}

export function isDefaultFilters(f: Pick<ReportFilters, "basis" | "statuses" | "payClasses">): boolean {
  return f.basis === "activity" && sameSet(f.statuses, DEFAULT_STATUSES) && sameSet(f.payClasses, ALL_PAY_CLASSES);
}

/** True when the current selection includes any OPEN (in-shop) status. */
export function hasAnyOpenSelected(statuses: string[]): boolean {
  return OPEN_STATUSES.some((s) => statuses.includes(s));
}

/** Reset the RO-scoped filters to "show everything" (keeps store + dates). */
export function resetFilters(f: ReportFilters): void {
  f.set({ basis: "activity", statuses: [...DEFAULT_STATUSES], payClasses: [...ALL_PAY_CLASSES] });
}

/** Short word for labels like "ROs <word>": "opened" | "closed" | "in range". */
export function roBasisWord(b: Basis): string {
  return b === "opened" ? "opened" : b === "closed" ? "closed" : "in range";
}
