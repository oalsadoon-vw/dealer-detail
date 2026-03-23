"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  // month+1 day0 is last day of month
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

function weekdayMon0(d: Date) {
  // Convert JS Sunday=0..Saturday=6 to Monday=0..Sunday=6
  const js = d.getUTCDay();
  return (js + 6) % 7;
}

function clampRange(a: Date, b: Date) {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export function DateRangePicker(props: {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const start = parseYmd(props.startDate);
  const end = parseYmd(props.endDate);

  const initialMonth = useMemo(() => {
    const base = start ?? end ?? new Date();
    return startOfMonth(base);
  }, [props.startDate, props.endDate]);

  const [month, setMonth] = useState<Date>(initialMonth);
  useEffect(() => setMonth(initialMonth), [initialMonth.getTime()]); // keep in sync when range changes externally

  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      const el = boxRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
        setPendingStart(null);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
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
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[m]} ${y}`;
  }, [month]);

  const grid = useMemo(() => {
    const first = startOfMonth(month);
    const offset = weekdayMon0(first); // 0..6
    const count = daysInMonth(month);
    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < offset; i++) cells.push({ date: null, key: `pad-${i}` });
    for (let day = 1; day <= count; day++) {
      const d = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
      cells.push({ date: d, key: toYmd(d) });
    }
    // pad to 6 rows
    while (cells.length < 42) cells.push({ date: null, key: `pad2-${cells.length}` });
    return cells;
  }, [month]);

  const display = props.startDate && props.endDate ? `${props.startDate} → ${props.endDate}` : "Select range…";

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="w-full rounded border px-2 py-2 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
      >
        {display}
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-[320px] rounded-lg border bg-white p-3 shadow">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setMonth(addMonths(month, -1))}>
              Prev
            </button>
            <div className="text-sm font-medium">{monthLabel}</div>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => setMonth(addMonths(month, 1))}>
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-600">
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

              const base = "h-9 rounded text-sm tabular-nums";
              const cls = isStart || isEnd
                ? `${base} bg-zinc-900 text-white`
                : inRange
                  ? `${base} bg-zinc-100`
                  : `${base} hover:bg-zinc-50`;

              return (
                <button key={c.key} type="button" className={cls} onClick={() => onPickDay(d)}>
                  {d.getUTCDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <div className="text-zinc-600">
              {pendingStart ? `Pick end date (start: ${toYmd(pendingStart)})` : "Pick start date"}
            </div>
            <button
              type="button"
              className="underline text-zinc-700"
              onClick={() => {
                setPendingStart(null);
                setOpen(false);
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


