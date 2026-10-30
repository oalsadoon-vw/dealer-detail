"use client";

import { hasAnyOpenSelected, type ReportFilters } from "@/lib/client/report-filters";
import { useComposition, openRoCount } from "@/lib/client/use-composition";

/**
 * D9 honesty caption — rendered under a page's top Stat row whenever the
 * current selection includes open (in-shop) ROs and the composition for the
 * range actually has some. Open-status dollars are quoted/in-progress and will
 * change; this line keeps the number honest.
 */
export function OpenRoCaption({ f }: { f: ReportFilters }) {
  const { data } = useComposition({ storeId: f.storeId, startDate: f.startDate, endDate: f.endDate, basis: f.basis });
  if (!hasAnyOpenSelected(f.statuses)) return null;
  const n = openRoCount(data);
  if (n <= 0) return null;
  return (
    <p className="text-xs text-fg-muted">
      Includes {n.toLocaleString("en-US")} open RO{n === 1 ? "" : "s"} — dollars still in progress
    </p>
  );
}
