"use client";

import { useMemo } from "react";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Button, Skeleton, EmptyState, type Column } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { useReport, fmtMoney, fmtNum, fmtPct, toCsv, downloadCsv } from "@/lib/client/use-report";
import { useReportsCtx } from "../shell";

type Row = {
  advisorId: string; name: string; persona: string | null;
  roCount: number; closedCount: number; cpRoCount: number;
  laborSale: number; laborGross: number; partsSale: number; partsGross: number;
  totalSale: number; totalGross: number; billHours: number; elr: number; hoursPerRo: number; salePerRo: number;
  menuRos: number; menuPenetration: number; cpLaborSale: number; wLaborSale: number; iLaborSale: number;
};
type Resp = { rows: Row[] };

export default function AdvisorsPage() {
  const { f, stores } = useReportsCtx();
  const { data, loading, error } = useReport<Resp>("advisors", f.query);
  const rows = data?.rows ?? [];
  const store = stores.find((s) => s.id === f.storeId);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    roCount: t.roCount + r.roCount, closedCount: t.closedCount + r.closedCount, cpRoCount: t.cpRoCount + r.cpRoCount,
    laborSale: t.laborSale + r.laborSale, laborGross: t.laborGross + r.laborGross, partsSale: t.partsSale + r.partsSale, partsGross: t.partsGross + r.partsGross,
    totalSale: t.totalSale + r.totalSale, totalGross: t.totalGross + r.totalGross, billHours: t.billHours + r.billHours, menuRos: t.menuRos + r.menuRos,
  }), { roCount: 0, closedCount: 0, cpRoCount: 0, laborSale: 0, laborGross: 0, partsSale: 0, partsGross: 0, totalSale: 0, totalGross: 0, billHours: 0, menuRos: 0 }), [rows]);

  const columns: Column<Row>[] = [
    { key: "name", header: "Advisor", cell: (r) => <span className="font-medium">{r.name}{r.persona && r.persona !== "SERVICE_ADVISOR" ? <span className="ml-1 text-[10px] text-fg-subtle">{r.persona.replace(/_/g, " ").toLowerCase()}</span> : null}</span>, sortable: true, sortValue: (r) => r.name, sticky: true },
    { key: "roCount", header: f.basis === "opened" ? "ROs opened" : "ROs closed", cell: (r) => fmtNum(r.roCount), sortable: true, sortValue: (r) => r.roCount, align: "right" },
    { key: "cpRoCount", header: "CP ROs", cell: (r) => fmtNum(r.cpRoCount), sortable: true, sortValue: (r) => r.cpRoCount, align: "right", hideOnMobile: true },
    { key: "billHours", header: "Bill hrs", cell: (r) => fmtNum(r.billHours, 1), sortable: true, sortValue: (r) => r.billHours, align: "right" },
    { key: "hoursPerRo", header: "Hrs/RO", cell: (r) => fmtNum(r.hoursPerRo, 2), sortable: true, sortValue: (r) => r.hoursPerRo, align: "right", hideOnMobile: true },
    { key: "laborSale", header: "Labor sale", cell: (r) => fmtMoney(r.laborSale), sortable: true, sortValue: (r) => r.laborSale, align: "right" },
    { key: "elr", header: "ELR", cell: (r) => fmtMoney(r.elr, 2), sortable: true, sortValue: (r) => r.elr, align: "right" },
    { key: "partsSale", header: "Parts sale", cell: (r) => fmtMoney(r.partsSale), sortable: true, sortValue: (r) => r.partsSale, align: "right" },
    { key: "totalSale", header: "Total sale", cell: (r) => <span className="font-medium">{fmtMoney(r.totalSale)}</span>, sortable: true, sortValue: (r) => r.totalSale, align: "right" },
    { key: "salePerRo", header: "Sale/RO", cell: (r) => fmtMoney(r.salePerRo), sortable: true, sortValue: (r) => r.salePerRo, align: "right", hideOnMobile: true },
    { key: "totalGross", header: "RO gross", cell: (r) => fmtMoney(r.totalGross), sortable: true, sortValue: (r) => r.totalGross, align: "right", hideOnMobile: true },
    { key: "menuPenetration", header: "Menu %", cell: (r) => <span title={`${r.menuRos} menu ROs`}>{fmtPct(r.menuPenetration, 0)}</span>, sortable: true, sortValue: (r) => r.menuPenetration, align: "right" },
  ];

  if (error) return <EmptyState title="Couldn't load report" description={error} />;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;
  if (rows.length === 0) return <EmptyState title="No advisor activity in this range" />;

  const top = [...rows].sort((a, b) => b.totalSale - a.totalSale).slice(0, 12);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Total sale by advisor</CardTitle><CardDescription>Labor + parts</CardDescription></CardHeader>
          <BarChart title="" data={top.map((r) => ({ label: r.name.split(" ")[0], value: r.totalSale }))} height={220} valueFormatter={(v) => fmtMoney(v)} />
        </Card>
        <Card>
          <CardHeader><CardTitle>{f.basis === "opened" ? "ROs opened" : "ROs closed"} by advisor</CardTitle><CardDescription>Count of repair orders</CardDescription></CardHeader>
          <BarChart title="" data={[...rows].sort((a, b) => b.roCount - a.roCount).slice(0, 12).map((r) => ({ label: r.name.split(" ")[0], value: r.roCount }))} height={220} valueFormatter={(v) => fmtNum(v)} color="#16a34a" />
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between p-4 pb-2">
          <CardHeader>
            <CardTitle>Advisor performance</CardTitle>
            <CardDescription>{fmtNum(totals.roCount)} ROs · {fmtNum(totals.billHours, 1)} hrs · {fmtMoney(totals.totalSale)} · ELR {totals.billHours ? fmtMoney(totals.laborSale / totals.billHours, 2) : "—"} · menu {totals.roCount ? fmtPct((totals.menuRos / totals.roCount) * 100, 0) : "—"}</CardDescription>
          </CardHeader>
          <Button size="sm" variant="subtle" onClick={() => downloadCsv(`${store?.abbreviation ?? "store"}-advisors-${f.basis}-${f.startDate}_${f.endDate}.csv`, toCsv(rows.map(({ advisorId: _a, ...r }) => r)))}>Export CSV</Button>
        </div>
        <DataTable<Row> columns={columns} rows={rows} keyField={(r) => r.advisorId || r.name} initialSort={{ key: "totalSale", dir: "desc" }} density="compact" />
      </Card>
    </div>
  );
}
