"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d: Date, delta: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
}

function daysInMonth(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
}

function weekdayMon0(d: Date) {
  // Convert JS Sunday=0..Saturday=6 to Monday=0..Sunday=6
  const js = d.getUTCDay();
  return (js + 6) % 7;
}

function clampRange(a: Date, b: Date) {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

const POPOVER_WIDTH = 320;
const POPOVER_GUESS_HEIGHT = 360;
const VIEWPORT_GUTTER = 12;

type Coords = { top: number; left: number; placement: "below" | "above" };

export function DateRangePicker(props: {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const start = parseYmd(props.startDate);
  const end = parseYmd(props.endDate);

  const initialMonth = useMemo(() => {
    const base = start ?? end ?? new Date();
    return startOfMonth(base);
  }, [props.startDate, props.endDate]);

  const [month, setMonth] = useState<Date>(initialMonth);
  useEffect(() => setMonth(initialMonth), [initialMonth.getTime()]);

  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<Coords>({
    top: 0,
    left: 0,
    placement: "below",
  });

  // Mark mounted on the client so we can safely use createPortal.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Recompute popover position when opened, on scroll, and on resize.
  // Using `useLayoutEffect` avoids a one-frame flash at the wrong spot.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const placement: "below" | "above" =
        spaceBelow >= POPOVER_GUESS_HEIGHT + VIEWPORT_GUTTER ||
        spaceBelow >= rect.top
          ? "below"
          : "above";

      let left = rect.left;
      // Keep popover inside the viewport horizontally.
      if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_GUTTER) {
        left = window.innerWidth - POPOVER_WIDTH - VIEWPORT_GUTTER;
      }
      if (left < VIEWPORT_GUTTER) left = VIEWPORT_GUTTER;

      const top = placement === "below" ? rect.bottom + 8 : rect.top - 8;
      setCoords({ top, left, placement });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Outside-click + ESC close handlers (registered while open).
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!(e.target instanceof Node)) return;
      if (trigger?.contains(e.target)) return;
      if (popover?.contains(e.target)) return;
      setOpen(false);
      setPendingStart(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setPendingStart(null);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function isInRange(d: Date) {
    if (!start || !end) return false;
    return d >= start && d <= end;
  }

  function isSameDay(a: Date | null, b: Date | null) {
    if (!a || !b) return false;
    return toYmd(a) === toYmd(b);
  }

  function onPickDay(d: Date) {
    if (!pendingStart) {
      setPendingStart(d);
      return;
    }
    const r = clampRange(pendingStart, d);
    props.onChange({ startDate: toYmd(r.start), endDate: toYmd(r.end) });
    setPendingStart(null);
    setOpen(false);
  }

  const monthLabel = useMemo(() => {
    const y = month.getUTCFullYear();
    const m = month.getUTCMonth();
    const names = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${names[m]} ${y}`;
  }, [month]);

  const grid = useMemo(() => {
    const first = startOfMonth(month);
    const offset = weekdayMon0(first);
    const count = daysInMonth(month);
    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < offset; i++) cells.push({ date: null, key: `pad-${i}` });
    for (let day = 1; day <= count; day++) {
      const d = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day)
      );
      cells.push({ date: d, key: toYmd(d) });
    }
    while (cells.length < 42)
      cells.push({ date: null, key: `pad2-${cells.length}` });
    return cells;
  }, [month]);

  const display =
    props.startDate && props.endDate
      ? `${props.startDate} → ${props.endDate}`
      : "Select range…";

  const popover =
    mounted && open ? (
      <div
        ref={popoverRef}
        style={{
          position: "fixed",
          top: coords.top,
          left: coords.left,
          width: POPOVER_WIDTH,
          transform: coords.placement === "above" ? "translateY(-100%)" : undefined,
          zIndex: 1000,
        }}
        // Solid surface + ring to make sure nothing bleeds through, and an
        // entrance pop so the calendar feels deliberate.
        className="rounded-lg border border-line bg-surface p-3 shadow-xl ring-1 ring-line/40 animate-fade-in"
        role="dialog"
        aria-modal="false"
        aria-label="Choose a date range"
      >
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg-strong"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            ‹ Prev
          </button>
          <div className="text-sm font-semibold text-fg-strong">
            {monthLabel}
          </div>
          <button
            type="button"
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg-strong"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            Next ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {grid.map((c) => {
            if (!c.date) return <div key={c.key} className="h-9" />;
            const d = c.date;
            const inRange = isInRange(d);
            const isStart = isSameDay(d, start) || isSameDay(d, pendingStart);
            const isEnd = isSameDay(d, end);

            const base =
              "h-9 rounded-md text-sm tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30";
            const cls =
              isStart || isEnd
                ? `${base} bg-accent text-accent-fg font-semibold`
                : inRange
                  ? `${base} bg-accent-soft text-fg-strong`
                  : `${base} text-fg hover:bg-surface-2`;

            return (
              <button
                key={c.key}
                type="button"
                className={cls}
                onClick={() => onPickDay(d)}
              >
                {d.getUTCDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-2 text-xs">
          <div className="text-fg-muted">
            {pendingStart
              ? `Pick end date · start: ${toYmd(pendingStart)}`
              : "Pick start date"}
          </div>
          <button
            type="button"
            className="text-accent transition-colors hover:text-accent-strong"
            onClick={() => {
              setPendingStart(null);
              setOpen(false);
            }}
          >
            Close
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="inline-block">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-9 min-w-[220px] items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 text-sm text-fg-strong shadow-sm transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/30"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="tabular-nums">{display}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-fg-subtle"
        >
          <path strokeLinecap="round" d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {/* Render the popover in a portal so it cannot be clipped by any
          ancestor stacking context, overflow, or sticky header. */}
      {mounted && open ? createPortal(popover, document.body) : null}
    </div>
  );
}
