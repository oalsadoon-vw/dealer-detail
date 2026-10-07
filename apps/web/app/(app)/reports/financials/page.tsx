"use client";

import { useMemo, useState } from "react";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Button, Skeleton, EmptyState, Stat, Badge, type Column } from "@/components/ui";
import { AreaChart } from "@/components/charts/AreaChart";
import { BarChart } from "@/components/charts/BarChart";
import { useReport, fmtMoney, fmtNum, fmtPct, fmtDateShort, toCsv, downloadCsv } from "@/lib/client/use-report";
import { useReportsCtx } from "../shell";

type Dept = { sales: number; cost: number; gross: number; grossPct: number; roCount: number; expenses: number };
type Line = {
  department: string; fsGroup: string | null; fsLine: string; fsPage: number | null;
  accounts: Array<{ glAccountId: string; accountNumber: string; accountName: string; accountType: string; mtd: number; period: number; mtdCount: number }>;
  sales: number; cost: number; gross: number; roCount: number;
  mtdSales: number; mtdCost: number; mtdGross: number; mtdCount: number;
};
type Resp = {
  range: { startDate: string; endDate: string };
  asOf: string | null; latestSnapshotDate: string | null; lastSnapshotAt: string | null;
  totals: { SERVICE: Dept; PARTS: Dept; BODY_SHOP: Dept };
  lines: Line[];
  series: Array<{ date: string; serviceSales: number; serviceGross: number; partsSales: number; partsGross: number; serviceRos: number }>;
};

const DEPT_LABEL: Record<string, string> = { SERVICE: "Service", PARTS: "Parts", BODY_SHOP: "Body Shop" };

export default function FinancialsPage() {
  const { f, stores } = useReportsCtx();
  // Financials have no opened/closed basis — strip it so the cache key stays stable.
  const query = f.query.replace(/&?basis=[a-z]+/, "");
  const { data, loading, error } = useReport<Resp>("financials", query);
  const store = stores.find((s) => s.id === f.storeId);
  const [dept, setDept] = useState<"SERVICE" | "PARTS">("SERVICE");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const lines = useMemo(() => (data?.lines ?? []).filter((l) => l.department === dept), [data, dept]);
  const sameMonth = data ? data.range.startDate.slice(0, 7) === data.range.endDate.slice(0, 7) : true;
  const isMtdView = data ? sameMonth && data.range.startDate.endsWith("-01") : false;

  if (error) return <EmptyState title="Couldn't load financials" description={error} />;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;
  if (!data.lines.length) {
    return (
      <EmptyState
        title="No financial-statement snapshots in this range"
        description={data.latestSnapshotDate ? `Latest snapshot for this store is ${fmtDateShort(data.latestSnapshotDate)}. Snapshots are captured nightly from Tekion's financial statement.` : "This store hasn't been snapshotted yet."}
      />
    );
  }

  const t = data.totals;
  const period = sameMonth ? (isMtdView ? `MTD through ${fmtDateShort(data.range.endDate)}` : `${fmtDateShort(data.range.startDate)} – ${fmtDateShort(data.range.endDate)}`) : `${fmtDateShort(data.range.startDate)} – ${fmtDateShort(data.range.endDate)} (spans months)`;

  const columns: Column<Line>[] = [
    {
      key: "fsLine", header: "FS line", sticky: true, sortable: true, sortValue: (r) => r.fsLine,
      cell: (r) => {
        const k = `${r.department}|${r.fsLine}`;
        const sale = r.accounts.find((a) => a.accountType === "SALE");
        return (
          <button type="button" className="text-left" onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}>
            <span className="font-medium">{sale?.accountName ?? r.fsLine}</span>
            <span className="ml-2 text-[10px] text-fg-subtle">{r.accounts.map((a) => a.accountNumber).join(" · ")}</span>
            {open[k] && (
              <div className="mt-1 space-y-0.5 text-[11px] text-fg-muted">
                {r.accounts.map((a) => (
                  <div key={a.glAccountId} className="flex gap-2">
                    <span className="w-14 font-mono">{a.accountNumber}</span>
                    <span className="flex-1 truncate">{a.accountName}</span>
                    <span className="w-24 text-right">{fmtMoney(a.period)}</span>
                    <span className="w-24 text-right text-fg-subtle">MTD {fmtMoney(a.mtd)}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        );
      },
    },
    { key: "roCount", header: "ROs (MTD)", cell: (r) => (r.mtdCount ? fmtNum(r.mtdCount) : "—"), sortable: true, sortValue: (r) => r.mtdCount, align: "right", hideOnMobile: true },
    { key: "sales", header: "Sales", cell: (r) => fmtMoney(r.sales), sortable: true, sortValue: (r) => r.sales, align: "right" },
    { key: "cost", header: "Cost", cell: (r) => fmtMoney(r.cost), sortable: true, sortValue: (r) => r.cost, align: "right", hideOnMobile: true },
    { key: "gross", header: "Gross", cell: (r) => <span className="font-medium">{fmtMoney(r.gross)}</span>, sortable: true, sortValue: (r) => r.gross, align: "right" },
    { key: "gp", header: "GP %", cell: (r) => (r.sales ? fmtPct((r.gross / r.sales) * 100, 1) : "—"), sortable: true, sortValue: (r) => (r.sales ? r.gross / r.sales : 0), align: "right", hideOnMobile: true },
    { key: "mtdSales", header: "MTD sales", cell: (r) => fmtMoney(r.mtdSales), sortable: true, sortValue: (r) => r.mtdSales, align: "right", hideOnMobile: true },
    { key: "mtdGross", header: "MTD gross", cell: (r) => fmtMoney(r.mtdGross), sortable: true, sortValue: (r) => r.mtdGross, align: "right" },
  ];

  const deptTotal = lines.reduce((a, l) => ({ sales: a.sales + l.sales, cost: a.cost + l.cost, gross: a.gross + l.gross, mtdSales: a.mtdSales + l.mtdSales, mtdGross: a.mtdGross + l.mtdGross }), { sales: 0, cost: 0, gross: 0, mtdSales: 0, mtdGross: 0 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-fg-muted">
          {period} · GL as of <span className="font-medium text-fg">{data.asOf ? fmtDateShort(data.asOf) : "—"}</span>
          {data.lastSnapshotAt && <> · snapshot {new Date(data.lastSnapshotAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>}
        </div>
        <Badge tone="neutral">Financial statement basis — postings, not RO lines</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Service sales" value={fmtMoney(t.SERVICE.sales)} subtext={`${fmtNum(t.SERVICE.roCount)} ROs MTD`} />
        <Stat label="Service gross" value={fmtMoney(t.SERVICE.gross)} subtext={`${fmtPct(t.SERVICE.grossPct, 1)} GP`} tone={t.SERVICE.gross >= 0 ? "success" : "danger"} />
        <Stat label="Parts sales" value={fmtMoney(t.PARTS.sales)} />
        <Stat label="Parts gross" value={fmtMoney(t.PARTS.gross)} subtext={`${fmtPct(t.PARTS.grossPct, 1)} GP`} tone={t.PARTS.gross >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Daily service gross</CardTitle><CardDescription>Day-over-day change in the GL (posting date)</CardDescription></CardHeader>
          <BarChart title="" data={data.series.map((d) => ({ label: fmtDateShort(d.date).replace(/\/\d\d$/, ""), value: d.serviceGross }))} height={220} valueFormatter={(v) => fmtMoney(v)} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Daily parts gross</CardTitle><CardDescription>Counter + RO parts, posting date</CardDescription></CardHeader>
          <AreaChart title="" data={data.series.map((d) => ({ label: fmtDateShort(d.date).replace(/\/\d\d$/, ""), value: d.partsGross }))} height={220} valueFormatter={(v) => fmtMoney(v)} color="#16a34a" />
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-2">
          <CardHeader>
            <CardTitle>{DEPT_LABEL[dept]} — financial statement lines</CardTitle>
            <CardDescription>{fmtMoney(deptTotal.sales)} sales · {fmtMoney(deptTotal.gross)} gross · MTD {fmtMoney(deptTotal.mtdSales)} / {fmtMoney(deptTotal.mtdGross)} · click a line for GL accounts</CardDescription>
          </CardHeader>
          <div className="flex items-center gap-2">
            {(["SERVICE", "PARTS"] as const).map((d) => (
              <Button key={d} size="sm" variant={dept === d ? "primary" : "subtle"} onClick={() => setDept(d)}>{DEPT_LABEL[d]}</Button>
            ))}
            <Button size="sm" variant="subtle" onClick={() => downloadCsv(`${store?.abbreviation ?? "store"}-financials-${dept.toLowerCase()}-${data.range.startDate}_${data.range.endDate}.csv`, toCsv(lines.flatMap((l) => l.accounts.map((a) => ({ department: l.department, fsLine: l.fsLine, account: a.accountNumber, name: a.accountName, type: a.accountType, period: a.period, mtd: a.mtd, mtdCount: a.mtdCount })))))}>Export CSV</Button>
          </div>
        </div>
        <DataTable<Line> columns={columns} rows={lines} keyField={(r) => `${r.department}|${r.fsLine}`} initialSort={{ key: "mtdSales", dir: "desc" }} density="compact" />
      </Card>
    </div>
  );
}
