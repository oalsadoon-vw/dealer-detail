"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Stat, Badge, Skeleton, EmptyState, type Column } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { useReport, fmtMoney, fmtNum, fmtPct } from "@/lib/client/use-report";
import { reportHref } from "@/lib/client/report-filters";
import { storeBrand } from "@/lib/client/store-brand";
import { useRegisterExportTable } from "@/components/reports/ExportProvider";
import { useReportsCtx } from "../shell";
import type { ExportColumn } from "@/lib/client/export";

const pg = (r: { byPayType?: Array<{ payClass: string; totalGross: number }> }, pc: string) =>
  r.byPayType?.find((p) => p.payClass === pc)?.totalGross ?? 0;

type Row = {
  storeId: string; name: string; abbreviation: string | null; apiSyncEnabled: boolean; lastSyncAt: string | null;
  roCount: number; closedCount: number; cpRoCount: number; laborSale: number; laborGross: number; partsSale: number; partsGross: number;
  totalSale: number; totalGross: number; billHours: number; elr: number; hoursPerRo: number; salePerRo: number; menuRos: number; menuPenetration: number;
  byPayType: Array<{ payClass: "CP" | "W" | "I" | "O"; totalGross: number }>;
};
type Resp = { rows: Row[] };
type FinDept = { sales: number; cost: number; gross: number; grossPct: number; roCount: number };
type FinRow = { storeId: string; name: string; abbreviation: string | null; asOf: string | null; service: FinDept; parts: FinDept };
type FinResp = { rows: FinRow[] };

const FLEET_STORE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "name", label: "Store", type: "text" },
  { key: "roCount", label: "ROs", type: "number" },
  { key: "cpRoCount", label: "CP ROs", type: "number" },
  { key: "billHours", label: "Bill hrs", type: "number" },
  { key: "hoursPerRo", label: "Hrs/RO", type: "number" },
  { key: "elr", label: "ELR", type: "money" },
  { key: "laborSale", label: "Labor", type: "money" },
  { key: "partsSale", label: "Parts", type: "money" },
  { key: "totalSale", label: "Total sale", type: "money" },
  { key: "salePerRo", label: "Sale/RO", type: "money" },
  { key: "cpGross", label: "CP gross", type: "money" },
  { key: "wGross", label: "Warr gross", type: "money" },
  { key: "iGross", label: "Int gross", type: "money" },
  { key: "totalGross", label: "Total gross", type: "money" },
  { key: "menuPenetration", label: "Menu %", type: "number" },
];
const FLEET_FIN_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "store", label: "Store", type: "text" },
  { key: "asOf", label: "GL as of", type: "date" },
  { key: "serviceRos", label: "Svc ROs (MTD)", type: "number" },
  { key: "serviceSales", label: "Service sales", type: "money" },
  { key: "serviceCost", label: "Service cost", type: "money" },
  { key: "serviceGross", label: "Service gross", type: "money" },
  { key: "serviceGp", label: "Service GP %", type: "number" },
  { key: "partsSales", label: "Parts sales", type: "money" },
  { key: "partsCost", label: "Parts cost", type: "money" },
  { key: "partsGross", label: "Parts gross", type: "money" },
  { key: "partsGp", label: "Parts GP %", type: "number" },
];

/**
 * "Fleet rollup" = all 7 AMG stores side by side for the same date range, plus
 * group totals. Each row links to that store's own report pages.
 */
export default function FleetPage() {
  const { f } = useReportsCtx();
  const q = new URLSearchParams({ startDate: f.startDate, endDate: f.endDate, basis: f.basis }).toString();
  const { data, loading, error } = useReport<Resp>("fleet", q);
  const finQ = new URLSearchParams({ startDate: f.startDate, endDate: f.endDate }).toString();
  const fin = useReport<FinResp>("financials-fleet", finQ);
  const rows = (data?.rows ?? []).filter((r) => r.apiSyncEnabled || r.roCount > 0);
  const finRows = (fin.data?.rows ?? []).filter((r) => r.service.sales || r.parts.sales);
  const FT = finRows.reduce((t, r) => ({ ss: t.ss + r.service.sales, sg: t.sg + r.service.gross, ps: t.ps + r.parts.sales, pg: t.pg + r.parts.gross }), { ss: 0, sg: 0, ps: 0, pg: 0 });

  const storeExport = useMemo(() => rows.map((r) => ({
    name: r.name, roCount: r.roCount, cpRoCount: r.cpRoCount, billHours: r.billHours, hoursPerRo: r.hoursPerRo,
    elr: r.elr, laborSale: r.laborSale, partsSale: r.partsSale, totalSale: r.totalSale, salePerRo: r.salePerRo,
    cpGross: pg(r, "CP"), wGross: pg(r, "W"), iGross: pg(r, "I"), totalGross: r.totalGross, menuPenetration: r.menuPenetration,
  })), [rows]);
  const finExport = useMemo(() => finRows.map((r) => ({
    store: r.abbreviation ?? r.name, asOf: r.asOf,
    serviceRos: r.service.roCount, serviceSales: r.service.sales, serviceCost: r.service.cost, serviceGross: r.service.gross, serviceGp: r.service.grossPct,
    partsSales: r.parts.sales, partsCost: r.parts.cost, partsGross: r.parts.gross, partsGp: r.parts.grossPct,
  })), [finRows]);

  useRegisterExportTable(
    { id: "fleet-store", name: "Store comparison", rows: storeExport, columns: FLEET_STORE_EXPORT_COLUMNS, primary: true },
    [storeExport]
  );
  useRegisterExportTable(
    { id: "fleet-fin", name: "Financial statement", rows: finExport, columns: FLEET_FIN_EXPORT_COLUMNS },
    [finExport]
  );

  if (error) return <EmptyState title="Couldn't load fleet rollup" description={error} />;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;

  const T = rows.reduce((t, r) => ({
    roCount: t.roCount + r.roCount, laborSale: t.laborSale + r.laborSale, partsSale: t.partsSale + r.partsSale, totalSale: t.totalSale + r.totalSale,
    totalGross: t.totalGross + r.totalGross, billHours: t.billHours + r.billHours, menuRos: t.menuRos + r.menuRos, cpRoCount: t.cpRoCount + r.cpRoCount,
  }), { roCount: 0, laborSale: 0, partsSale: 0, totalSale: 0, totalGross: 0, billHours: 0, menuRos: 0, cpRoCount: 0 });

  const finCols: Column<FinRow>[] = [
    { key: "name", header: "Store", cell: (r) => { const b = storeBrand(r.abbreviation); return <Link href={reportHref("/reports/financials", { ...f, storeId: r.storeId })} className="flex items-center gap-2 font-medium hover:underline"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.accent }} />{r.name}</Link>; }, sortable: true, sortValue: (r) => r.name, sticky: true },
    { key: "asOf", header: "GL as of", cell: (r) => r.asOf ? <Badge tone="neutral" size="sm">{r.asOf.slice(5).replace("-", "/")}</Badge> : <Badge tone="danger" size="sm">none</Badge>, hideOnMobile: true },
    { key: "sRos", header: "Svc ROs (MTD)", cell: (r) => fmtNum(r.service.roCount), sortable: true, sortValue: (r) => r.service.roCount, align: "right", hideOnMobile: true },
    { key: "sSales", header: "Service sales", cell: (r) => fmtMoney(r.service.sales), sortable: true, sortValue: (r) => r.service.sales, align: "right" },
    { key: "sGross", header: "Service gross", cell: (r) => <span className="font-medium">{fmtMoney(r.service.gross)}</span>, sortable: true, sortValue: (r) => r.service.gross, align: "right" },
    { key: "sGp", header: "GP %", cell: (r) => fmtPct(r.service.grossPct, 1), sortable: true, sortValue: (r) => r.service.grossPct, align: "right", hideOnMobile: true },
    { key: "pSales", header: "Parts sales", cell: (r) => fmtMoney(r.parts.sales), sortable: true, sortValue: (r) => r.parts.sales, align: "right" },
    { key: "pGross", header: "Parts gross", cell: (r) => <span className="font-medium">{fmtMoney(r.parts.gross)}</span>, sortable: true, sortValue: (r) => r.parts.gross, align: "right" },
    { key: "pGp", header: "GP %", cell: (r) => fmtPct(r.parts.grossPct, 1), sortable: true, sortValue: (r) => r.parts.grossPct, align: "right", hideOnMobile: true },
  ];

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
    { key: "cpGross", header: "CP gross", cell: (r) => fmtMoney(pg(r, "CP")), sortable: true, sortValue: (r) => pg(r, "CP"), align: "right", hideOnMobile: true },
    { key: "wGross", header: "Warr gross", cell: (r) => fmtMoney(pg(r, "W")), sortable: true, sortValue: (r) => pg(r, "W"), align: "right", hideOnMobile: true },
    { key: "iGross", header: "Int gross", cell: (r) => fmtMoney(pg(r, "I")), sortable: true, sortValue: (r) => pg(r, "I"), align: "right", hideOnMobile: true },
    { key: "totalGross", header: "Total gross", cell: (r) => <span className="font-medium">{fmtMoney(r.totalGross)}</span>, sortable: true, sortValue: (r) => r.totalGross, align: "right" },
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
        </div>
        <DataTable<Row> columns={cols} rows={rows} keyField={(r) => r.storeId} initialSort={{ key: "totalSale", dir: "desc" }} density="compact" />
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between p-4 pb-2">
          <CardHeader>
            <CardTitle>Financial statement — Service &amp; Parts</CardTitle>
            <CardDescription>GL postings for the date range (same source as the printed OEM statement) · fleet service gross {fmtMoney(FT.sg)} on {fmtMoney(FT.ss)} · parts gross {fmtMoney(FT.pg)} on {fmtMoney(FT.ps)}</CardDescription>
          </CardHeader>
        </div>
        {fin.loading ? <Skeleton className="h-40 w-full" /> : fin.error ? <EmptyState title="Couldn't load financials" description={fin.error} /> : finRows.length === 0 ? <EmptyState title="No GL snapshots in this range" /> : (
          <DataTable<FinRow> columns={finCols} rows={finRows} keyField={(r) => r.storeId} initialSort={{ key: "sGross", dir: "desc" }} density="compact" />
        )}
      </Card>
    </div>
  );
}
