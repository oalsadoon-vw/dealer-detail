"use client";

/**
 * Shared filter state for every /reports/* page — store, date range, and the
 * Opened vs Closed basis. Persisted in the URL (?store=&start=&end=&basis=)
 * so links/bookmarks reproduce exactly what a manager was looking at, and so
 * switching pages keeps the same filters.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type Basis = "opened" | "closed";
export type StoreOpt = { id: string; name: string; abbreviation: string | null };

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
  set: (patch: Partial<Pick<ReportFilters, "storeId" | "startDate" | "endDate" | "basis">>) => void;
  query: string; // encoded query string for /api/reports/*
}

export function useReportFilters(stores: StoreOpt[]): ReportFilters {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = todayPacific();

  const storeId = sp.get("store") && stores.some((s) => s.id === sp.get("store")) ? sp.get("store")! : (stores[0]?.id ?? "");
  const startDate = sp.get("start") ?? monthStartOf(today);
  const endDate = sp.get("end") ?? today;
  const basis: Basis = sp.get("basis") === "opened" ? "opened" : "closed";

  const set = useCallback<ReportFilters["set"]>((patch) => {
    const next = new URLSearchParams(sp.toString());
    const cur = { storeId, startDate, endDate, basis, ...patch };
    next.set("store", cur.storeId);
    next.set("start", cur.startDate);
    next.set("end", cur.endDate);
    next.set("basis", cur.basis);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [sp, router, pathname, storeId, startDate, endDate, basis]);

  const query = useMemo(() => new URLSearchParams({ storeId, startDate, endDate, basis }).toString(), [storeId, startDate, endDate, basis]);

  return { storeId, startDate, endDate, basis, set, query };
}

/** Preserve the current filters when linking between report pages. */
export function reportHref(path: string, f: Pick<ReportFilters, "storeId" | "startDate" | "endDate" | "basis">) {
  return `${path}?${new URLSearchParams({ store: f.storeId, start: f.startDate, end: f.endDate, basis: f.basis }).toString()}`;
}
