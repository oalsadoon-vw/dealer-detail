import { resolveTenantContext } from "@/lib/server/tenant-context";
import { prisma } from "@/lib/db";
import { Badge, Card, CardHeader, CardTitle, CardDescription, EmptyState, SectionHeading } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * /sync — Sync Status. Replaces the retired Upload + Runs pages.
 * Every store is fed by the Tekion Open API (nightly host-side sync), so the
 * only operational question is "is each store's data fresh?". This page reads
 * SyncRun (latest per store + recent history) and the RoFact watermark.
 */

type Summary = {
  created?: number;
  updated?: number;
  unchanged?: number;
  skippedFanOut?: number;
  warningsCount?: number;
  interruptedBy?: string;
};

function fmtWhen(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtDur(a: Date, b: Date | null | undefined) {
  if (!b) return "running";
  const s = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${(m / 60).toFixed(1)}h`;
}
function ageHours(d: Date | null | undefined) {
  if (!d) return Infinity;
  return (Date.now() - d.getTime()) / 36e5;
}
function statusTone(s: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (s === "COMPLETED") return "success";
  if (s === "COMPLETED_WITH_WARNINGS") return "warning";
  if (s === "FAILED") return "danger";
  if (s === "RUNNING") return "info";
  return "neutral";
}

export default async function SyncStatusPage() {
  const tc = await resolveTenantContext();
  const storeIds = tc.org.accessibleStoreIds;
  const stores = storeIds.length
    ? await prisma.store.findMany({
        where: { id: { in: storeIds }, organizationId: tc.org.organizationId },
        select: { id: true, name: true, abbreviation: true, apiSyncEnabled: true, tekionDealerId: true },
        orderBy: { name: "asc" },
      })
    : [];

  const runs = storeIds.length
    ? await prisma.syncRun.findMany({
        where: { storeId: { in: storeIds } },
        orderBy: { startedAt: "desc" },
        take: 60,
        select: {
          id: true, storeId: true, kind: true, status: true, apiCallCount: true, rosFetched: true,
          startedAt: true, finishedAt: true, summary: true, errors: true, windowStart: true, windowEnd: true,
        },
      })
    : [];

  // Latest finished run per store + latest RO modified watermark from facts.
  const latestByStore = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latestByStore.has(r.storeId)) latestByStore.set(r.storeId, r);

  const watermarks = storeIds.length
    ? await prisma.rawRepairOrder.groupBy({
        by: ["storeId"],
        where: { storeId: { in: storeIds } },
        _max: { fetchedAt: true, sourceModifiedAt: true },
        _count: { _all: true },
      })
    : [];
  const wmByStore = new Map(watermarks.map((w) => [w.storeId, w]));

  const stale = stores.filter((s) => ageHours(wmByStore.get(s.id)?._max.fetchedAt) > 30);

  return (
    <main className="fade-in-up space-y-6 pb-20 min-w-0">
      <SectionHeading
        title="Sync Status"
        description="Tekion Open API → nightly host sync → fact tables. Green = data is fresh as of the last run."
        size="page"
      />

      {stale.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="font-semibold">Stale:</span> {stale.map((s) => s.abbreviation).join(", ")} — no successful fetch in 30h.
          Reports for these stores may be missing recent ROs.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stores</CardTitle>
          <CardDescription>Latest run per store and the newest repair order on file.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-fg-muted">
              <tr className="border-b border-line text-left">
                <th className="py-2 pr-3">Store</th>
                <th className="py-2 pr-3">Dealer</th>
                <th className="py-2 pr-3">Last run</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">ROs</th>
                <th className="py-2 pr-3 text-right">New / Upd / Skip</th>
                <th className="py-2 pr-3 text-right">API calls</th>
                <th className="py-2 pr-3 text-right">Duration</th>
                <th className="py-2 pr-3">Newest RO fetched</th>
                <th className="py-2 pr-3 text-right">ROs on file</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const r = latestByStore.get(s.id);
                const wm = wmByStore.get(s.id);
                const sm = (r?.summary ?? {}) as Summary;
                const fresh = ageHours(wm?._max.fetchedAt) <= 30;
                return (
                  <tr key={s.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium">
                      <span className={"inline-block h-2 w-2 rounded-full mr-2 " + (fresh ? "bg-emerald-500" : "bg-amber-500")} />
                      {s.name} <span className="text-fg-muted">({s.abbreviation})</span>
                    </td>
                    <td className="py-2 pr-3 text-fg-muted">{s.apiSyncEnabled ? s.tekionDealerId ?? "—" : "API off"}</td>
                    <td className="py-2 pr-3">{fmtWhen(r?.startedAt)}</td>
                    <td className="py-2 pr-3">{r ? <Badge tone={statusTone(r.status)} size="sm">{r.status.replace(/_/g, " ")}</Badge> : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r?.rosFetched ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-fg-muted">
                      {r ? `${sm.created ?? 0} / ${sm.updated ?? 0} / ${sm.skippedFanOut ?? 0}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r?.apiCallCount ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r ? fmtDur(r.startedAt, r.finishedAt) : "—"}</td>
                    <td className="py-2 pr-3">{fmtWhen(wm?._max.fetchedAt)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{wm?._count._all?.toLocaleString() ?? "0"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Last {runs.length} sync runs across your stores.</CardDescription>
        </CardHeader>
        {runs.length === 0 ? (
          <EmptyState title="No sync runs yet" description="The nightly job hasn't recorded a run for these stores." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-fg-muted">
                <tr className="border-b border-line text-left">
                  <th className="py-2 pr-3">Started</th>
                  <th className="py-2 pr-3">Store</th>
                  <th className="py-2 pr-3">Kind</th>
                  <th className="py-2 pr-3">Window</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">ROs</th>
                  <th className="py-2 pr-3 text-right">Calls</th>
                  <th className="py-2 pr-3 text-right">Duration</th>
                  <th className="py-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const st = stores.find((s) => s.id === r.storeId);
                  const sm = (r.summary ?? {}) as Summary;
                  const errs = Array.isArray(r.errors) ? (r.errors as unknown[]).length : r.errors ? 1 : 0;
                  const notes = [
                    sm.warningsCount ? `${sm.warningsCount} warnings` : null,
                    errs ? `${errs} errors` : null,
                    sm.interruptedBy ? `interrupted (${sm.interruptedBy})` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <tr key={r.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-3 whitespace-nowrap">{fmtWhen(r.startedAt)}</td>
                      <td className="py-1.5 pr-3">{st?.abbreviation ?? "?"}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">{r.kind}</td>
                      <td className="py-1.5 pr-3 text-fg-muted whitespace-nowrap">
                        {r.windowStart.toISOString().slice(0, 10)} → {r.windowEnd.toISOString().slice(0, 10)}
                      </td>
                      <td className="py-1.5 pr-3"><Badge tone={statusTone(r.status)} size="sm">{r.status.replace(/_/g, " ")}</Badge></td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.rosFetched}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.apiCallCount}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{fmtDur(r.startedAt, r.finishedAt)}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">{notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
