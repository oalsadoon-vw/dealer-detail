"use client";

import Link from "next/link";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Stat, Button, Badge, Skeleton, EmptyState, type Column } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { useReport, fmtMoney, fmtNum, fmtPct, toCsv, downloadCsv } from "@/lib/client/use-report";
import { reportHref } from "@/lib/client/report-filters";
import { storeBrand } from "@/lib/client/store-brand";
import { useReportsCtx } from "../shell";

type Row = {
  storeId: string; name: string; abbreviation: string | null; apiSyncEnabled: boolean; lastSyncAt: string | null;
  roCount: number; closedCount: number; cpRoCount: number; laborSale: number; laborGross: number; partsSale: number; partsGross: number;
  totalSale: number; totalGross: number; billHours: number; elr: number; hoursPerRo: number; salePerRo: number; menuRos: number; menuPenetration: number;
};
type Resp = { rows: Row[] };

/**
 * "Fleet rollup" = all 7 AMG stores side by side for the same date range, plus
 * group totals. Each row links to that store's own report pages.
 */
export default function FleetPage() {
  const { f } = useReportsCtx();
  const q = new URLSearchParams({ startDate: f.startDate, endDate: f.endDate, basis: f.basis }).toString();
  const { data, loading, error } = useReport<Resp>("fleet", q);
  const rows = (data?.rows ?? []).filter((r) => r.apiSyncEnabled || r.roCount > 0);

  if (error) return <EmptyState title="Couldn't load fleet rollup" description={error} />;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;

  const T = rows.reduce((t, r) => ({
    roCount: t.roCount + r.roCount, laborSale: t.laborSale + r.laborSale, partsSale: t.partsSale + r.partsSale, totalSale: t.totalSale + r.totalSale,
    totalGross: t.totalGross + r.totalGross, billHours: t.billHours + r.billHours, menuRos: t.menuRos + r.menuRos, cpRoCount: t.cpRoCount + r.cpRoCount,
  }), { roCount: 0, laborSale: 0, partsSale: 0, totalSale: 0, totalGross: 0, billHours: 0, menuRos: 0, cpRoCount: 0 });

  const cols: Column<Row>[] = [
    { key: "name", header: "Store", cell: (r) => { const b = storeBrand(r.abbreviation); return <Link href={reportHref("/reports", { ...f, storeId: r.storeId })} className="flex items-center gap-2 font-medium hover:underline"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.accent }} />{r.name}</Link>; }, sortable: true, sortValue: (r) => r.name, sticky: true },
    { key: "sync", header: "Synced", cell: (r) => r.lastSyncAt ? <Badge tone={Date.now() - new Date(r.lastSyncAt).getTime() < 36 * 3600e3 ? "success" : "warning"} size="sm" dot>{new Date(r.lastSyncAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "numeric", day: "numeric", hour: "numeric" })}</Badge> : <Badge tone="danger" size="sm">never</Badge>, hideOnMobile: true },
    { key: "roCount", header: f.basis === "opened" ? "ROs opened" : "ROs closed", cell: (r) => fmtNum(r.roCount), sortable: true, sortValue: (r) => r.roCount, align: "right" },
    { key: "cpRoCount", header: "CP ROs", cell: (r) => fmtNum(r.cpRoCount), sortable: true, sortValue: (r) => r.cpRoCount, align: "right", hideOnMobile: true },
    { key: "billHours", header: "Bill hrs", cell: (r) => fmtNum(r.billHours, 1), sortable: true, sortValue: (r) => r.billHours, align: "right" },
    { key: "hoursPerRo", header: "Hrs/RO", cell: (r) => fmtNum(r.hoursPerRo, 2), sortable: true, sortValue: (r) => r.hoursPerRo, align: "right", hideOnMobile: true },
    { key: "elr", header: "ELR", cell: (r) => fmtMoney(r.elr, 2), sortable: true, sortValue: (r) => r.elr, align: "right" },
    { key: "laborSale", header: "Labor", cell: (r) => fmtMoney(r.laborSale), sortable: true, sortValue: (r) => r.laborSale, align: "right", hideOnMobile: true },
    { key: "partsSale", header: "Parts", cell: (r) => fmtMoney(r.partsSale), sortable: true, sortValue: (r) => r.partsSale, align: "right", hideOnMobile: true },
    { key: "totalSale", header: "Total sale", cell: (r) => <span className="font-medium">{fmtMoney(r.totalSale)}</span>, sortable: true, sortValue: (r) => r.totalSale, align: "right" },
    { key: "salePerRo", header: "Sale/RO", cell: (r) => fmtMoney(r.salePerRo), sortable: true, sortValue: (r) => r.salePerRo, align: "right", hideOnMobile: true },
    { key: "totalGross", header: "RO gross", cell: (r) => fmtMoney(r.totalGross), sortable: true, sortValue: (r) => r.totalGross, align: "right", hideOnMobile: true },
    { key: "menuPenetration", header: "Menu %", cell: (r) => <span title={`${r.menuRos} menu ROs`}>{fmtPct(r.menuPenetration, 0)}</span>, sortable: true, sortValue: (r) => r.menuPenetration, align: "right" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`ROs ${f.basis}`} value={fmtNum(T.roCount)} subtext={`${rows.length} stores · ${fmtNum(T.cpRoCount)} customer-pay`} />
        <Stat label="Total sale" value={fmtMoney(T.totalSale)} subtext={`${fmtMoney(T.roCount ? T.totalSale / T.roCount : 0)} / RO`} tone="accent" />
        <Stat label="Billed hours" value={fmtNum(T.billHours, 1)} subtext={`ELR ${T.billHours ? fmtMoney(T.laborSale / T.billHours, 2) : "—"}`} />
        <Stat label="Menu penetration" value={fmtPct(T.roCount ? (T.menuRos / T.roCount) * 100 : 0)} subtext={`${fmtNum(T.menuRos)} menu ROs`} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Total sale by store</CardTitle></CardHeader><BarChart title="" data={rows.map((r) => ({ label: r.abbreviation ?? r.name, value: r.totalSale }))} height={220} valueFormatter={(v) => fmtMoney(v)} /></Card>
        <Card><CardHeader><CardTitle>Menu penetration by store</CardTitle><CardDescription>% of ROs with a factory menu</CardDescription></CardHeader><BarChart title="" data={rows.map((r) => ({ label: r.abbreviation ?? r.name, value: r.menuPenetration }))} height={220} valueFormatter={(v) => fmtPct(v, 0)} color="#16a34a" /></Card>
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between p-4 pb-2">
          <CardHeader><CardTitle>Store comparison</CardTitle><CardDescription>Same date range and basis across every store</CardDescription></CardHeader>
          <Button size="sm" variant="subtle" onClick={() => downloadCsv(`fleet-${f.basis}-${f.startDate}_${f.endDate}.csv`, toCsv(rows.map(({ storeId: _s, ...r }) => r)))}>Export CSV</Button>
        </div>
        <DataTable<Row> columns={cols} rows={rows} keyField={(r) => r.storeId} initialSort={{ key: "totalSale", dir: "desc" }} density="compact" />
      </Card>
    </div>
  );
}
