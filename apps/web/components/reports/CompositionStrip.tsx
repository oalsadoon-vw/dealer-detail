"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/components/ui/cn";
import { Drawer, Skeleton } from "@/components/ui";
import { FilterChip } from "./FilterChip";
import {
  ALL_PAY_CLASSES,
  ALL_STATUSES,
  OPEN_STATUSES,
  PAY_CLASS_LABEL,
  isDefaultFilters,
  resetFilters,
  type PayClass,
  type ReportFilters,
} from "@/lib/client/report-filters";
import { fmtCompact } from "@/lib/client/use-report";
import { useComposition, sliceSale } from "@/lib/client/use-composition";

const GROUP_ORDER = ["posted", "invoiced", "open", "voided", "other"] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  posted: "Posted",
  invoiced: "Invoiced",
  open: "Open",
  voided: "Voided",
  other: "Other",
};

function statusGroup(status: string): (typeof GROUP_ORDER)[number] {
  if (status === "CLOSED") return "posted";
  if (status === "INVOICED") return "invoiced";
  if (status === "VOIDED") return "voided";
  if ((OPEN_STATUSES as readonly string[]).includes(status)) return "open";
  return "other";
}

function statusChipLabel(status: string): string {
  if (status === "CLOSED") return "Posted";
  if (status === "INVOICED") return "Invoiced";
  if (status === "VOIDED") return "Voided";
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function canonicalize(list: string[]): string[] {
  const ordered = (ALL_STATUSES as readonly string[]).filter((s) => list.includes(s));
  const extras = list.filter((s) => !(ALL_STATUSES as readonly string[]).includes(s));
  return [...ordered, ...extras];
}

const STATUS_TOOLTIP =
  "Click to include or exclude this status. Option/Alt-click to show only this status. The strip always shows every RO in range, so you can see what a number is made of before hiding anything.";
const PAY_TOOLTIP =
  "Pay type filters apply per job; RO counts = ROs with at least one matching job. Option/Alt-click to show only this pay type.";

/**
 * The composition strip (PLAN D4/D5) — the "map" of what makes up the number.
 * Sticky under the filter bar; each status/pay type is a toggle chip showing
 * `label · count · $`. Filled = on, outlined = off. On small screens it
 * collapses to a "Filters · N hidden" button that opens a bottom sheet.
 */
export function CompositionStrip({ f, accent, accentFg }: { f: ReportFilters; accent: string; accentFg: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const stickyRef = useRef<HTMLDivElement>(null);

  const { data, loading, error } = useComposition({ storeId: f.storeId, startDate: f.startDate, endDate: f.endDate, basis: f.basis });

  // Track whether the strip has pinned to the top (for the subtle stuck shadow).
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      setStuck(top <= 1);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const hiddenCount =
    (ALL_STATUSES as readonly string[]).filter((s) => !f.statuses.includes(s)).length +
    ALL_PAY_CLASSES.filter((p) => !f.payClasses.includes(p)).length;

  const toggleStatus = (status: string, solo: boolean) => {
    const on = f.statuses.includes(status);
    if (solo) return f.set({ statuses: [status] });
    if (on) {
      const next = f.statuses.filter((s) => s !== status);
      if (next.length === 0) return; // keep at least one status on
      f.set({ statuses: next });
    } else {
      f.set({ statuses: canonicalize([...f.statuses, status]) });
    }
  };

  const togglePay = (pc: PayClass, solo: boolean) => {
    const on = f.payClasses.includes(pc);
    if (solo) return f.set({ payClasses: [pc] });
    if (on) {
      const next = f.payClasses.filter((p) => p !== pc);
      if (next.length === 0) return; // keep at least one pay type on
      f.set({ payClasses: next });
    } else {
      f.set({ payClasses: ALL_PAY_CLASSES.filter((p) => p === pc || f.payClasses.includes(p)) });
    }
  };

  const statusSlices = useMemo(() => {
    if (!data) return [];
    return data.byStatus.slice().sort((a, b) => {
      const ai = (ALL_STATUSES as readonly string[]).indexOf(a.status as (typeof ALL_STATUSES)[number]);
      const bi = (ALL_STATUSES as readonly string[]).indexOf(b.status as (typeof ALL_STATUSES)[number]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [data]);

  const groups = useMemo(() => {
    const map = new Map<(typeof GROUP_ORDER)[number], typeof statusSlices>();
    for (const s of statusSlices) {
      const g = statusGroup(s.status);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, slices: map.get(g)! }));
  }, [statusSlices]);

  const renderStatusChips = () =>
    groups.map(({ group, slices }) => (
      <div key={group} className="flex flex-wrap items-center gap-1">
        <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{GROUP_LABEL[group]}</span>
        {slices.map((s) => {
          const sale = sliceSale(s);
          return (
            <FilterChip
              key={s.status}
              label={statusChipLabel(s.status)}
              count={s.count.toLocaleString("en-US")}
              money={fmtCompact(sale)}
              on={f.statuses.includes(s.status)}
              muted={s.count === 0}
              tooltip={STATUS_TOOLTIP}
              accent={accent}
              accentFg={accentFg}
              onClick={(o) => toggleStatus(s.status, o.solo)}
            />
          );
        })}
      </div>
    ));

  const reclosedChip = data ? (
    <FilterChip
      label="Re-closed"
      count={data.reclosed.count.toLocaleString("en-US")}
      money={fmtCompact(sliceSale(data.reclosed))}
      on={false}
      informational
      muted
      tooltip="ROs reopened and closed again; shown in their original close month"
      accent={accent}
      accentFg={accentFg}
    />
  ) : null;

  const renderPayChips = () => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Pay</span>
      {ALL_PAY_CLASSES.map((pc) => {
        const slice = data?.byPay.find((p) => p.payClass === pc);
        const count = slice?.roCount ?? 0;
        const sale = slice ? sliceSale(slice) : 0;
        return (
          <FilterChip
            key={pc}
            label={PAY_CLASS_LABEL[pc]}
            count={count.toLocaleString("en-US")}
            money={fmtCompact(sale)}
            on={f.payClasses.includes(pc)}
            muted={count === 0}
            tooltip={PAY_TOOLTIP}
            accent={accent}
            accentFg={accentFg}
            onClick={(o) => togglePay(pc, o.solo)}
          />
        );
      })}
    </div>
  );

  const resetLink = !isDefaultFilters(f) ? (
    <button
      type="button"
      className="text-xs font-medium text-accent hover:text-accent-strong hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
      onClick={() => resetFilters(f)}
    >
      Reset
    </button>
  ) : null;

  const body = loading ? (
    // Two stacked rows of skeletons, matching the loaded strip's typical height
    // so the page doesn't jump when composition data arrives.
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-28" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-20" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-16" /><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-16" /><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-16" />
      </div>
    </div>
  ) : error ? (
    <p className="text-xs text-fg-subtle">Couldn't load composition: {error}</p>
  ) : (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {renderStatusChips()}
      {reclosedChip}
      <span aria-hidden className="hidden h-4 w-px self-center bg-line sm:block" />
      {renderPayChips()}
      {resetLink}
    </div>
  );

  return (
    <>
      <div
        ref={stickyRef}
        className={cn(
          "sticky top-0 z-30 -mx-1 rounded-lg border border-line bg-surface px-3 py-2 transition-shadow duration-quick",
          stuck && "shadow-md"
        )}
      >
        {/* Desktop / tablet: inline chip strip */}
        <div className="hidden sm:block">{body}</div>

        {/* Mobile: collapsed trigger button */}
        <div className="flex items-center justify-between sm:hidden">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            onClick={() => setDrawerOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <path strokeLinecap="round" d="M2 4h12M2 8h12M2 12h12" />
            </svg>
            Filters
            {hiddenCount > 0 && <span className="text-fg-subtle">· {hiddenCount} hidden</span>}
          </button>
          {resetLink}
        </div>
      </div>

      {/* Mobile bottom sheet with the same chips */}
      <Drawer side="bottom" open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters" description="Show or hide statuses and pay types — tap to toggle, long-press for only.">
        <div className="space-y-4 px-5 py-4">
          {loading ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-7 w-16" /><Skeleton className="h-7 w-24" /><Skeleton className="h-7 w-20" />
            </div>
          ) : error ? (
            <p className="text-xs text-fg-subtle">Couldn't load composition: {error}</p>
          ) : (
            <>
              <div className="space-y-3">
                {renderStatusChips()}
                {reclosedChip && <div className="flex flex-wrap items-center gap-1">{reclosedChip}</div>}
              </div>
              <div className="border-t border-line-subtle pt-3">
                {renderPayChips()}
              </div>
            </>
          )}
          {resetLink && <div>{resetLink}</div>}
        </div>
      </Drawer>
    </>
  );
}
