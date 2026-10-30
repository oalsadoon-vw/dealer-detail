"use client";

export type StatusMixDatum = { posted?: number; invoiced?: number; open?: number };

const COLORS = { posted: "#16a34a", invoiced: "#0ea5e9", open: "#f59e0b" };
const LABELS = { posted: "posted", invoiced: "invoiced", open: "open" } as const;

/**
 * Per-row "status mix" mini stacked bar (posted / invoiced / open) for the
 * Advisor Performance table (PLAN B4). Lets a manager see each advisor's
 * composition without touching the filter strip.
 *
 * NOTE: `getAdvisorPerformance` (Lane A) does NOT yet return per-status counts
 * for each advisor, so callers pass `data` via a stub that is currently
 * `undefined`. When Lane A adds it, feed `{ posted, invoiced, open }` here.
 */
export function StatusMix({ data }: { data?: StatusMixDatum | null }) {
  if (!data) {
    return <span className="text-fg-subtle" title="Per-status mix coming soon">—</span>;
  }
  const total = (data.posted ?? 0) + (data.invoiced ?? 0) + (data.open ?? 0);
  if (total <= 0) return <span className="text-fg-subtle">—</span>;

  const segs = [
    { key: "posted" as const, v: data.posted ?? 0 },
    { key: "invoiced" as const, v: data.invoiced ?? 0 },
    { key: "open" as const, v: data.open ?? 0 },
  ].filter((s) => s.v > 0);

  const title = segs.map((s) => `${LABELS[s.key]} ${s.v}`).join(" · ");

  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="flex h-2 w-16 overflow-hidden rounded-full bg-surface-3 ring-1 ring-line">
        {segs.map((s) => (
          <span
            key={s.key}
            className="h-full"
            style={{ width: `${(s.v / total) * 100}%`, background: COLORS[s.key] }}
          />
        ))}
      </span>
      <span className="text-[11px] tabular-nums text-fg-subtle">{total}</span>
    </span>
  );
}
