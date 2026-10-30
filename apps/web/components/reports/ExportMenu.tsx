"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui";
import { useExportTables } from "./ExportProvider";
import { useReportsCtx, reportPageMeta } from "@/app/(app)/reports/shell";
import { exportCsv, exportXlsx, exportPdf, buildExportFilename } from "@/lib/client/export";
import type { ReportFilters } from "@/lib/client/report-filters";

/**
 * Single "Export ▾" button in the page header. Opens a small menu:
 *   - CSV — exports the primary (first) table, labelled with its name
 *   - Excel — exports EVERY registered table + a "Filters" sheet
 *   - PDF — prints the page (Save as PDF in the dialog)
 * Keyboard accessible (Escape closes), closes on outside click.
 */
export function ExportMenu() {
  const { tables } = useExportTables();
  const { f, stores } = useReportsCtx();
  const pathname = usePathname() ?? "/reports";
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const meta = reportPageMeta(pathname);
  const store = stores.find((s) => s.id === f.storeId);
  const abbr = store?.abbreviation ?? "STORE";
  const fAny = f as ReportFilters & { statuses?: string[]; payClasses?: string[] };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const csvTable = tables.find((t) => t.primary) ?? tables[0];
  const base = { store: abbr, report: meta.slug, startDate: f.startDate, endDate: f.endDate, basis: f.basis };

  const doCsv = () => {
    if (!csvTable) return;
    exportCsv(buildExportFilename({ ...base, ext: "csv" }), csvTable.rows, csvTable.columns);
    setOpen(false);
  };

  const doXlsx = () => {
    exportXlsx(
      buildExportFilename({ ...base, ext: "xlsx" }),
      tables,
      {
        store: abbr,
        pageTitle: meta.title,
        startDate: f.startDate,
        endDate: f.endDate,
        basis: f.basis,
        statuses: fAny.statuses,
        payClasses: fAny.payClasses,
        url: typeof window !== "undefined" ? window.location.href : "",
      }
    );
    setOpen(false);
  };

  const doPdf = () => {
    setOpen(false);
    setHint('Choose "Save as PDF" in the print dialog');
    window.setTimeout(() => {
      exportPdf();
      window.setTimeout(() => setHint(null), 0);
    }, 120);
  };

  const menuBtn = "w-full text-left px-3 py-2 text-sm text-fg-strong hover:bg-surface-2 transition-colors disabled:opacity-50";

  return (
    <div ref={rootRef} className="relative print-hide">
      <Button
        size="sm"
        variant="subtle"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        trailing={
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        }
      >
        Export
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 rounded-md border border-line bg-surface py-1 shadow-lg"
        >
          <button role="menuitem" className={menuBtn} onClick={doCsv} disabled={!csvTable}>
            CSV{csvTable ? ` — ${csvTable.name}` : ""}
          </button>
          <button role="menuitem" className={menuBtn} onClick={doXlsx} disabled={tables.length === 0}>
            Excel — all tables
          </button>
          <button role="menuitem" className={menuBtn} onClick={doPdf}>
            PDF
          </button>
        </div>
      )}

      {hint && (
        <div className="absolute right-0 z-50 mt-1 rounded-md border border-line bg-surface px-3 py-2 text-xs text-fg-muted shadow-lg">
          {hint}
        </div>
      )}
    </div>
  );
}