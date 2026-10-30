"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useReportsCtx, reportPageMeta } from "@/app/(app)/reports/shell";
import { storeBrand } from "@/lib/client/store-brand";
import { generatedAtPT } from "@/lib/client/export";
import type { ReportFilters } from "@/lib/client/report-filters";

/**
 * Print-only header. Rendered in the shell (hidden on screen via `.print-only`,
 * shown under `@media print`) so a printed/PDF export always carries the store
 * wordmark, page title, date range, basis, active filters, generated-at (PT)
 * and the source URL — the exact context a number traces back to.
 */
export function PrintHeader() {
  const { f, stores } = useReportsCtx();
  const pathname = usePathname() ?? "/reports";
  const meta = reportPageMeta(pathname);
  const store = stores.find((s) => s.id === f.storeId);
  const brand = storeBrand(store?.abbreviation ?? null);

  const fAny = f as ReportFilters & { statuses?: string[]; payClasses?: string[] };
  const filterBits = [
    fAny.statuses?.length ? `Status: ${fAny.statuses.join(", ")}` : null,
    fAny.payClasses?.length ? `Pay type: ${fAny.payClasses.join(", ")}` : null,
  ].filter((x): x is string => !!x);

  // Populated after mount so SSR/client render identically (avoids hydration
  // mismatch on the timestamp + window.location).
  const [info, setInfo] = useState({ genAt: "", url: "" });
  useEffect(() => setInfo({ genAt: generatedAtPT(), url: window.location.href }), []);

  return (
    <header className="print-only">
      <div className="flex items-start justify-between gap-4 border-b-2 border-zinc-900 pb-2 mb-3">
        <div>
          <div className="text-lg font-bold tracking-tight" style={{ color: brand.accent }}>
            {brand.wordmark}
          </div>
          <div className="text-sm text-zinc-700">{store?.name ?? "Reports"}</div>
        </div>
        <div className="text-right text-xs text-zinc-800">
          <div className="text-sm font-semibold">{meta.title}</div>
          <div>
            {f.startDate} – {f.endDate} · basis: {f.basis}
          </div>
          {filterBits.map((bit) => (
            <div key={bit}>{bit}</div>
          ))}
          <div>Generated (PT): {info.genAt || "—"}</div>
          <div className="text-[10px] text-zinc-500">{info.url}</div>
        </div>
      </div>
    </header>
  );
}