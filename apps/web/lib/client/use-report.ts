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
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    const url = `/api/reports/${kind}?${query}${extraQs}`;
    // Retry transient failures (pool timeout / 503 / 504 / network blip) up to
    // 3× with backoff before surfacing an error — one cold query shouldn't
    // leave a manager staring at "Couldn't load".
    const run = async () => {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (!alive) return;
        try {
          const d = await fetchApi<T>(url, { signal: ctrl.signal });
          if (alive) setState({ data: d, loading: false, error: null });
          return;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (ctrl.signal.aborted) return;
          const retryable = /timed out|retrying|Request failed \((502|503|504|429)\)|Failed to fetch|NetworkError|Load failed/i.test(msg);
          if (!retryable || attempt === 3) break;
          await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
        }
      }
      if (alive) setState({ data: null, loading: false, error: lastErr instanceof Error ? lastErr.message : String(lastErr) });
    };
    void run();
    return () => { alive = false; ctrl.abort(); };
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
