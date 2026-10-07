"use client";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Stat, Button, Skeleton, EmptyState, type Column } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { useReport, fmtMoney, fmtNum, fmtPct, fmtDateShort, toCsv, downloadCsv } from "@/lib/client/use-report";
import { useReportsCtx } from "../shell";

type AdvRow = { advisorId: string; name: string; roCount: number; menuRos: number; menuLines: number; penetration: number; menuLaborSale: number; menuPartsSale: number; menuTotal: number };
type OpRow = { opcode: string; description: string | null; lines: number; laborSale: number; partsSale: number; total: number };
type Resp = {
  totals: { roCount: number; menuRos: number; menuLines: number; menuLaborSale: number; menuPartsSale: number; menuTotal: number; penetration: number; lines: number };
  rows: AdvRow[];
  opcodes: OpRow[];
  series: Array<{ date: string; menuRos: number; menuLines: number; menuTotal: number }>;
};

/** Pull the mileage interval out of TEK<mileage>[BPV][NS]M, e.g. TEK60000BNM → "60K Basic". */
function menuLabel(opcode: string): string {
  const m = /^TEK(\d{4,6})([BPV])([NS])M$/.exec(opcode);
  if (!m) return opcode;
  const miles = Number(m[1]);
  const tier = m[2] === "B" ? "Basic" : m[2] === "P" ? "Plus" : "Value";
  const sched = m[3] === "S" ? " (severe)" : "";
  return `${miles >= 1000 ? `${miles / 1000}K` : miles} ${tier}${sched}`;
}

export default function MenuSalesPage() {
  const { f, stores } = useReportsCtx();
  const { data, loading, error } = useReport<Resp>("menu", f.query);
  const store = stores.find((s) => s.id === f.storeId);

  if (error) return <EmptyState title="Couldn't load report" description={error} />;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;
  const t = data.totals;
  if (t.roCount === 0) return <EmptyState title="No ROs in this range" />;

  const advCols: Column<AdvRow>[] = [
    { key: "name", header: "Advisor", cell: (r) => <span className="font-medium">{r.name}</span>, sortable: true, sortValue: (r) => r.name, sticky: true },
    { key: "menuRos", header: "Menus sold", cell: (r) => <span className="font-semibold">{fmtNum(r.menuRos)}</span>, sortable: true, sortValue: (r) => r.menuRos, align: "right" },
    { key: "roCount", header: f.basis === "opened" ? "ROs opened" : "ROs closed", cell: (r) => fmtNum(r.roCount), sortable: true, sortValue: (r) => r.roCount, align: "right" },
    { key: "penetration", header: "Penetration", cell: (r) => fmtPct(r.penetration, 0), sortable: true, sortValue: (r) => r.penetration, align: "right" },
    { key: "menuLaborSale", header: "Menu labor", cell: (r) => fmtMoney(r.menuLaborSale), sortable: true, sortValue: (r) => r.menuLaborSale, align: "right", hideOnMobile: true },
    { key: "menuPartsSale", header: "Menu parts", cell: (r) => fmtMoney(r.menuPartsSale), sortable: true, sortValue: (r) => r.menuPartsSale, align: "right", hideOnMobile: true },
    { key: "menuTotal", header: "Menu $", cell: (r) => <span className="font-medium">{fmtMoney(r.menuTotal)}</span>, sortable: true, sortValue: (r) => r.menuTotal, align: "right" },
    { key: "avg", header: "Avg / menu", cell: (r) => (r.menuRos ? fmtMoney(r.menuTotal / r.menuRos) : "—"), sortable: true, sortValue: (r) => (r.menuRos ? r.menuTotal / r.menuRos : 0), align: "right", hideOnMobile: true },
  ];
  const opCols: Column<OpRow>[] = [
    { key: "opcode", header: "Menu", cell: (r) => <span><span className="font-medium">{menuLabel(r.opcode)}</span> <span className="text-[11px] text-fg-subtle">{r.opcode}</span></span>, sortable: true, sortValue: (r) => r.opcode, sticky: true },
    { key: "lines", header: "Sold", cell: (r) => fmtNum(r.lines), sortable: true, sortValue: (r) => r.lines, align: "right" },
    { key: "laborSale", header: "Labor", cell: (r) => fmtMoney(r.laborSale), sortable: true, sortValue: (r) => r.laborSale, align: "right", hideOnMobile: true },
    { key: "partsSale", header: "Parts", cell: (r) => fmtMoney(r.partsSale), sortable: true, sortValue: (r) => r.partsSale, align: "right", hideOnMobile: true },
    { key: "total", header: "Total", cell: (r) => <span className="font-medium">{fmtMoney(r.total)}</span>, sortable: true, sortValue: (r) => r.total, align: "right" },
    { key: "avg", header: "Avg", cell: (r) => fmtMoney(r.lines ? r.total / r.lines : 0), sortable: true, sortValue: (r) => (r.lines ? r.total / r.lines : 0), align: "right" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Menus sold" value={fmtNum(t.menuRos)} subtext={`${fmtNum(t.lines)} menu lines`} tone="accent" spark={{ data: data.series.map((d) => ({ value: d.menuRos })) }} />
        <Stat label="Penetration" value={fmtPct(t.penetration)} subtext={`of ${fmtNum(t.roCount)} ROs ${f.basis}`} />
        <Stat label="Menu revenue" value={fmtMoney(t.menuTotal)} subtext={`labor ${fmtMoney(t.menuLaborSale)} · parts ${fmtMoney(t.menuPartsSale)}`} tone="success" spark={{ data: data.series.map((d) => ({ value: d.menuTotal })) }} />
        <Stat label="Avg menu ticket" value={fmtMoney(t.menuRos ? t.menuTotal / t.menuRos : 0)} subtext="menu $ ÷ menus sold" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Menus sold by advisor</CardTitle><CardDescription>ROs carrying ≥1 factory menu package (TEK…BNM/PSM/VNM)</CardDescription></CardHeader>
          <BarChart title="" data={data.rows.filter((r) => r.menuRos > 0).map((r) => ({ label: r.name.split(" ")[0], value: r.menuRos }))} height={220} valueFormatter={(v) => fmtNum(v)} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Menus sold per day</CardTitle><CardDescription>{fmtDateShort(f.startDate)} – {fmtDateShort(f.endDate)}</CardDescription></CardHeader>
          <BarChart title="" data={data.series.map((d) => ({ label: fmtDateShort(d.date), value: d.menuRos }))} height={220} valueFormatter={(v) => fmtNum(v)} color="#16a34a" />
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between p-4 pb-2">
          <CardHeader><CardTitle>By advisor</CardTitle><CardDescription>Same math as the daily/MTD menu-sales scorecard emails</CardDescription></CardHeader>
          <Button size="sm" variant="subtle" onClick={() => downloadCsv(`${store?.abbreviation ?? "store"}-menu-sales-${f.basis}-${f.startDate}_${f.endDate}.csv`, toCsv(data.rows.map(({ advisorId: _a, ...r }) => r)))}>Export CSV</Button>
        </div>
        <DataTable<AdvRow> columns={advCols} rows={data.rows} keyField={(r) => r.advisorId || r.name} initialSort={{ key: "menuRos", dir: "desc" }} density="compact" />
      </Card>

      <Card padded={false}>
        <div className="p-4 pb-2"><CardHeader><CardTitle>By menu package</CardTitle><CardDescription>Which intervals / tiers are selling</CardDescription></CardHeader></div>
        <DataTable<OpRow> columns={opCols} rows={data.opcodes} keyField={(r) => r.opcode} initialSort={{ key: "lines", dir: "desc" }} density="compact" />
      </Card>
    </div>
  );
}
