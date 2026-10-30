"use client";

/**
 * Client contract for `GET /api/reports/composition` (built by Lane A).
 *
 * The composition endpoint is intentionally UNFILTERED by status/pay so the
 * chip strip always shows the full picture for the current store + range +
 * basis (PLAN A5). It is used by two components — `CompositionStrip` (the
 * chip map) and `OpenRoCaption` (the "includes N open ROs" honesty line).
 */

import { useReport, type RemoteState } from "@/lib/client/use-report";
import { OPEN_STATUSES, type Basis, type PayClass } from "@/lib/client/report-filters";

export interface StatusSlice {
  status: string;
  count: number;
  laborSale: number;
  partsSale: number;
}

export interface PaySlice {
  payClass: PayClass;
  roCount: number;
  laborSale: number;
  partsSale: number;
}

export interface ReclosedSlice {
  count: number;
  laborSale: number;
  partsSale: number;
}

export interface CompositionData {
  byStatus: StatusSlice[];
  byPay: PaySlice[];
  reclosed: ReclosedSlice;
}

export interface CompositionParams {
  storeId: string;
  startDate: string;
  endDate: string;
  basis: Basis;
}

/** Build the /api/reports/composition query string (store + range + basis only). */
export function compositionQuery(p: CompositionParams): string {
  return new URLSearchParams({ storeId: p.storeId, startDate: p.startDate, endDate: p.endDate, basis: p.basis }).toString();
}

export function useComposition(p: CompositionParams): RemoteState<CompositionData> {
  return useReport<CompositionData>("composition", compositionQuery(p));
}

/** Sum of RO counts for statuses in the OPEN (in-shop) group. */
export function openRoCount(data: CompositionData | null | undefined): number {
  if (!data) return 0;
  return data.byStatus
    .filter((s) => OPEN_STATUSES.includes(s.status as (typeof OPEN_STATUSES)[number]))
    .reduce((t, s) => t + s.count, 0);
}

/** Total sale (labor + parts) for a slice, for the compact `$` chip figure. */
export function sliceSale(s: { laborSale: number; partsSale: number }): number {
  return (s.laborSale ?? 0) + (s.partsSale ?? 0);
}
