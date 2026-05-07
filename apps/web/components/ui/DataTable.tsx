"use client";

import React, { useMemo, useState, useCallback } from "react";
import { cn } from "./cn";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K; dir: SortDir };

export type Column<T, K extends string = string> = {
  key: K;
  header: React.ReactNode;
  /** Cell renderer — receives the row and the row index. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Sortable column? Provide `sortValue` to drive comparison. */
  sortable?: boolean;
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Tailwind alignment helpers for both header and cell. */
  align?: "left" | "right" | "center";
  /** Max width hint (px). Truncates with ellipsis when overflowing. */
  maxWidth?: number;
  /** Hide on small screens (`md:` breakpoint and below). */
  hideOnMobile?: boolean;
  /** Pin header / cell within the row visually (e.g. row name column). */
  sticky?: boolean;
  /** Optional fixed/min width hint. */
  width?: number | string;
  className?: string;
};

type Density = "comfy" | "compact";

type DataTableProps<T, K extends string = string> = {
  columns: Column<T, K>[];
  rows: T[];
  /** Stable identifier per row. */
  keyField: (row: T) => string;
  /** Initial sort. Component can be uncontrolled (handles sort internally). */
  initialSort?: SortState<K>;
  /** Use to make sort controlled. */
  sort?: SortState<K> | null;
  onSortChange?: (s: SortState<K> | null) => void;
  density?: Density;
  /** Render a compact density toggle in the table's top-right corner. */
  showDensityToggle?: boolean;
  /** Sticky header (within the scroll container). */
  stickyHeader?: boolean;
  /** Zebra alternate rows. */
  zebra?: boolean;
  /** Empty state to render when `rows` is empty (and not loading). */
  empty?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  className?: string;
  /** Optional click handler — gives consumers row-level interactions. */
  onRowClick?: (row: T, index: number) => void;
};

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const ROW_PADDING: Record<Density, string> = {
  comfy: "px-4 py-3",
  compact: "px-3 py-1.5",
};

/**
 * Generic, accessible data table with sortable headers, sticky thead,
 * zebra rows, hover, density toggle, and skeleton/empty states. Built on
 * native `<table>` semantics — no extra dep — so screen readers Just Work.
 */
export function DataTable<T, K extends string = string>({
  columns,
  rows,
  keyField,
  initialSort,
  sort,
  onSortChange,
  density: densityProp,
  showDensityToggle = false,
  stickyHeader = true,
  zebra = true,
  empty,
  loading = false,
  loadingRows = 5,
  className,
  onRowClick,
}: DataTableProps<T, K>) {
  const [internalSort, setInternalSort] = useState<SortState<K> | null>(
    initialSort ?? null
  );
  const [internalDensity, setInternalDensity] = useState<Density>(
    densityProp ?? "comfy"
  );
  const density = densityProp ?? internalDensity;
  const activeSort = sort !== undefined ? sort : internalSort;

  const setSort = useCallback(
    (next: SortState<K> | null) => {
      if (onSortChange) onSortChange(next);
      else setInternalSort(next);
    },
    [onSortChange]
  );

  const sortedRows = useMemo(() => {
    if (!activeSort) return rows;
    const col = columns.find((c) => c.key === activeSort.key);
    if (!col || !col.sortValue) return rows;
    const sorter = col.sortValue;
    const dir = activeSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sorter(a);
      const bv = sorter(b);
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av instanceof Date && bv instanceof Date) {
        return (av.getTime() - bv.getTime()) * dir;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, columns, activeSort]);

  const cycleSort = (key: K) => {
    if (!activeSort || activeSort.key !== key) {
      setSort({ key, dir: "asc" });
    } else if (activeSort.dir === "asc") {
      setSort({ key, dir: "desc" });
    } else {
      setSort(null);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface overflow-hidden",
        className
      )}
    >
      {showDensityToggle && (
        <div className="flex items-center justify-end gap-1 px-3 pt-2 -mb-1">
          <button
            type="button"
            onClick={() => setInternalDensity("comfy")}
            aria-label="Comfortable density"
            className={cn(
              "rounded p-1 text-fg-subtle hover:text-fg-strong hover:bg-surface-2 transition-colors",
              density === "comfy" && "text-fg-strong bg-surface-2"
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" d="M2 4h10M2 7h10M2 10h10" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setInternalDensity("compact")}
            aria-label="Compact density"
            className={cn(
              "rounded p-1 text-fg-subtle hover:text-fg-strong hover:bg-surface-2 transition-colors",
              density === "compact" && "text-fg-strong bg-surface-2"
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                d="M2 3h10M2 5h10M2 7h10M2 9h10M2 11h10"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead
            className={cn(
              "bg-surface-2/60 text-fg-subtle",
              stickyHeader && "sticky top-0 z-10"
            )}
          >
            <tr className="border-b border-line">
              {columns.map((col) => {
                const isActive = activeSort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
                      ROW_PADDING[density],
                      ALIGN[col.align ?? "left"],
                      col.hideOnMobile && "hidden md:table-cell",
                      col.sticky && "sticky left-0 bg-surface-2/95 z-10",
                      col.className
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => cycleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-fg-strong transition-colors",
                          isActive && "text-fg-strong"
                        )}
                      >
                        {col.header}
                        <SortGlyph
                          dir={isActive ? activeSort?.dir : null}
                          active={isActive}
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {loading ? (
              Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        ROW_PADDING[density],
                        col.hideOnMobile && "hidden md:table-cell"
                      )}
                    >
                      <Skeleton h={14} w="80%" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="bg-surface">
                  {empty ?? (
                    <EmptyState
                      title="Nothing to show yet"
                      description="When data is available, it will appear here."
                    />
                  )}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, i) => (
                <tr
                  key={keyField(row)}
                  onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer",
                    zebra && i % 2 === 1 && "bg-surface-2/30",
                    "hover:bg-accent-soft/40"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        ROW_PADDING[density],
                        ALIGN[col.align ?? "left"],
                        col.hideOnMobile && "hidden md:table-cell",
                        col.sticky &&
                          "sticky left-0 bg-surface group-hover:bg-accent-soft/40",
                        col.maxWidth ? "truncate" : null,
                        col.className
                      )}
                      style={col.maxWidth ? { maxWidth: col.maxWidth } : undefined}
                    >
                      {col.cell(row, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortGlyph({ dir, active }: { dir: SortDir | null | undefined; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex flex-col leading-[6px] transition-opacity",
        active ? "opacity-100" : "opacity-40"
      )}
    >
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        fill="currentColor"
        className={cn(
          "transition-opacity",
          dir === "desc" && "opacity-30"
        )}
      >
        <path d="M4 0L8 5H0z" />
      </svg>
      <svg
        width="8"
        height="5"
        viewBox="0 0 8 5"
        fill="currentColor"
        className={cn(
          "transition-opacity mt-0.5",
          dir === "asc" && "opacity-30"
        )}
      >
        <path d="M4 5L0 0h8z" />
      </svg>
    </span>
  );
}
