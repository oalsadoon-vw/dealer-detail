"use client";

import { useState } from "react";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Button, Tabs, Badge, Skeleton, EmptyState, type Column } from "@/components/ui";
import { useReport, fmtMoney, fmtNum, toCsv, downloadCsv } from "@/lib/client/use-report";
import { useReportsCtx } from "../shell";

type Ro = {
  ro: string; status: string | null; type: string | null; openDate: string; closeDate: string | null; isClosed: boolean;
  advisor: string; vehicle: string; vin: string | null; mileage: number | null;
  laborSale: number; partsSale: number; totalSale: number; gross: number; billHours: number;
  cp: number; warranty: number; internal: number; hasMenu: boolean; menuLines: number;
};

const STATUS_TONE: Record<string, "success" | "warning" | "info" | "neutral" | "danger"> = {
  CLOSED: "success", INVOICED: "success", READY_FOR_INVOICE: "info", IN_PROGRESS: "warning", TECH_ASSIGNED: "warning", HOLD: "danger", VOIDED: "neutral",
};

/**
 * The tie-out page. Every RO in range with BOTH its open and close date, so a
 * manager comparing against Tekion's RO list can see exactly why a count
 * differs (RO opened 9/2 but closed 9/4 → counted on 9/2 in Opened, 9/4 in Closed).
 */
export default function RoListPage() {
  const { f, stores } = useReportsCtx();
  const store = stores.find((s) => s.id === f.storeId);
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const { data, loading, error } = useReport<Ro[]>("ros", f.query, { status, limit: "5000" });
  const rows = data ?? [];

  const cols: Column<Ro>[] = [
    { key: "ro", header: "RO #", cell: (r) => <span className="font-medium tabular-nums">{r.ro}</span>, sortable: true, sortValue: (r) => r.ro, sticky: true },
    { key: "status", header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status ?? ""] ?? "neutral"} size="sm">{(r.status ?? "").replace(/_/g, " ").toLowerCase()}</Badge>, sortable: true, sortValue: (r) => r.status ?? "" },
    { key: "openDate", header: "Opened", cell: (r) => r.openDate, sortable: true, sortValue: (r) => r.openDate },
    { key: "closeDate", header: "Closed", cell: (r) => r.closeDate ?? <span className="text-fg-subtle">open</span>, sortable: true, sortValue: (r) => r.closeDate ?? "9999" },
    { key: "advisor", header: "Advisor", cell: (r) => r.advisor, sortable: true, sortValue: (r) => r.advisor },
    { key: "vehicle", header: "Vehicle", cell: (r) => <span title={r.vin ?? ""}>{r.vehicle}</span>, hideOnMobile: true },
    { key: "type", header: "Type", cell: (r) => (r.type ?? "").replace(/_/g, " ").toLowerCase(), sortable: true, sortValue: (r) => r.type ?? "", hideOnMobile: true },
    { key: "billHours", header: "Hrs", cell: (r) => fmtNum(r.billHours, 1), sortable: true, sortValue: (r) => r.billHours, align: "right", hideOnMobile: true },
    { key: "cp", header: "CP", cell: (r) => fmtMoney(r.cp), sortable: true, sortValue: (r) => r.cp, align: "right", hideOnMobile: true },
    { key: "warranty", header: "Warr", cell: (r) => fmtMoney(r.warranty), sortable: true, sortValue: (r) => r.warranty, align: "right", hideOnMobile: true },
    { key: "internal", header: "Int", cell: (r) => fmtMoney(r.internal), sortable: true, sortValue: (r) => r.internal, align: "right", hideOnMobile: true },
    { key: "totalSale", header: "Total", cell: (r) => <span className="font-medium">{fmtMoney(r.totalSale)}</span>, sortable: true, sortValue: (r) => r.totalSale, align: "right" },
    { key: "hasMenu", header: "Menu", cell: (r) => (r.hasMenu ? <Badge tone="accent" size="sm">menu</Badge> : null), sortable: true, sortValue: (r) => (r.hasMenu ? 1 : 0), align: "center" },
  ];

  const tot = rows.reduce((t, r) => ({ n: t.n + 1, sale: t.sale + r.totalSale, hrs: t.hrs + r.billHours, closed: t.closed + (r.isClosed ? 1 : 0) }), { n: 0, sale: 0, hrs: 0, closed: 0 });

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-2">
          <CardHeader>
            <CardTitle>Repair orders {f.basis === "opened" ? "opened" : "closed"} in range</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${fmtNum(tot.n)} ROs · ${fmtNum(tot.closed)} closed · ${fmtNum(tot.hrs, 1)} hrs · ${fmtMoney(tot.sale)}`}</CardDescription>
          </CardHeader>
          <div className="flex items-center gap-2">
            <Tabs tabs={[{ id: "all", label: "All" }, { id: "open", label: "Still open" }, { id: "closed", label: "Closed" }]} value={status} onChange={(v) => setStatus(v as typeof status)} variant="segmented" />
            <Button size="sm" variant="subtle" disabled={!rows.length} onClick={() => downloadCsv(`${store?.abbreviation ?? "store"}-ros-${f.basis}-${f.startDate}_${f.endDate}.csv`, toCsv(rows))}>Export CSV</Button>
          </div>
        </div>
        {error ? <EmptyState title="Couldn't load" description={error} /> : loading ? <Skeleton className="m-4 h-64" /> : (
          <DataTable<Ro> columns={cols} rows={rows} keyField={(r) => r.ro} initialSort={{ key: f.basis === "opened" ? "openDate" : "closeDate", dir: "desc" }} density="compact" empty={<EmptyState title="No ROs in this range" />} />
        )}
      </Card>
      <p className="text-[11px] text-fg-subtle">Opened = Tekion check-in / creation date. Closed = Tekion CLOSED_TIME. Tekion's RO-list date filter is the Opened date; the financial statement and Closed-MTD scorecards use the Closed date.</p>
    </div>
  );
}
