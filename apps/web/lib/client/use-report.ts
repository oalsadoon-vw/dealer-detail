"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/client/fetch-api";

export type RemoteState<T> = { data: T | null; loading: boolean; error: string | null };

/** Minimal fetch-on-change hook for /api/reports/<kind>?<query>. */
export function useReport<T>(kind: string, query: string, extra?: Record<string, string | undefined>): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({ data: null, loading: true, error: null });
  const extraQs = extra
    ? Object.entries(extra).filter(([, v]) => v != null && v !== "").map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v!)}`).join("")
    : "";
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchApi<T>(`/api/reports/${kind}?${query}${extraQs}`)
      .then((d) => alive && setState({ data: d, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) }));
    return () => { alive = false; };
  }, [kind, query, extraQs]);
  return state;
}

export const fmtMoney = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtNum = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtPct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `${n.toFixed(digits)}%`);
export const fmtDateShort = (s: string) => {
  const [y, m, d] = s.split("-"); return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
