"use client";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Stat, Button, Skeleton, EmptyState, Badge, type Column } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { useReport, fmtMoney, fmtNum, toCsv, downloadCsv } from "@/lib/client/use-report";
import { todayPacific, monthStartOf } from "@/lib/client/report-filters";
import { useReportsCtx } from "../shell";

type Cell = { laborSale: number; billHours: number; elr: number | null };
type Bucket = { key: string; label: string; group: "paytype" | "program" | "other"; laborSale: number; billHours: number; ros: number; elr: number | null };
type AdvRow = { advisorId: string; name: string; cp: Cell; warranty: Cell; internal: Cell; total: Cell };
type MonthRow = { month: string; cp: number | null; warranty: number | null; internal: number | null; total: number | null; txm: number | null; toyotaCare: number | null; prepaid: number | null; pdi: number | null };
type Resp = {
  store: { abbreviation: string; name: string; isToyota: boolean; houseMakes: string[] };
  buckets: Bucket[];
  advisors: AdvRow[];
  series: MonthRow[];
};

const fmtRate = (n: number | null | undefined) => (n == null ? "—" : fmtMoney(n, 2));
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

/**
 * Effective Labor Rate — Joe's WIP "LABOR RATES / ELR" block, live.
 * ELR = labor sale ÷ billed hours. Bucket recipe mirrors the WIP sheet
 * (CP excludes ToyotaCare/prepaid, Internal excludes PDI, TXM/TAC/TSC/PDI
 * are opcode buckets across all pay types, "Other make" = non-house makes).
 */
export default function ElrPage() {
  const { f, stores } = useReportsCtx();
  const { data, loading, error } = useReport<Resp>("elr", f.query);
  const store = stores.find((s) => s.id === f.storeId);
  const today = todayPacific();

  if (error) return <EmptyState title="Couldn't load report" description={error} />;
  if (loading || !data) return <Skeleton className="h-96 w-full" />;

  const b = Object.fromEntries(data.buckets.map((x) => [x.key, x])) as Record<string, Bucket | undefined>;
  if (!b.total || b.total.billHours === 0) return <EmptyState title="No billed hours in this range" />;

  const isYtd = f.startDate === `${today.slice(0, 4)}-01-01`;
  const isMtd = f.startDate === monthStartOf(today);
  const windowLabel = isYtd ? "YTD" : isMtd ? "MTD" : "custom range";
  const wipDefault = data.store.isToyota ? "YTD" : "MTD";

  const programs = data.buckets.filter((x) => x.group === "program" && x.billHours > 0);
  const others = data.buckets.filter((x) => x.group === "other" && x.billHours > 0);

  const bucketCols: Column<Bucket>[] = [
    { key: "label", header: "Bucket", cell: (r) => <span className="font-medium">{r.label}</span>, sticky: true },
    { key: "elr", header: "ELR", cell: (r) => <span className="font-semibold">{fmtRate(r.elr)}</span>, align: "right", sortable: true, sortValue: (r) => r.elr ?? 0 },
    { key: "laborSale", header: "Labor sale", cell: (r) => fmtMoney(r.laborSale), align: "right", sortable: true, sortValue: (r) => r.laborSale, hideOnMobile: true },
    { key: "billHours", header: "Billed hrs", cell: (r) => fmtNum(r.billHours, 1), align: "right", sortable: true, sortValue: (r) => r.billHours },
    { key: "ros", header: "ROs", cell: (r) => fmtNum(r.ros), align: "right", sortable: true, sortValue: (r) => r.ros, hideOnMobile: true },
  ];

  const advCols: Column<AdvRow>[] = [
    { key: "name", header: "Advisor", cell: (r) => <span className="font-medium">{r.name}</span>, sticky: true, sortable: true, sortValue: (r) => r.name },
    { key: "cp", header: "CP ELR", cell: (r) => <span className="font-semibold">{fmtRate(r.cp.elr)}</span>, align: "right", sortable: true, sortValue: (r) => r.cp.elr ?? 0 },
    { key: "cpHrs", header: "CP hrs", cell: (r) => fmtNum(r.cp.billHours, 1), align: "right", sortable: true, sortValue: (r) => r.cp.billHours, hideOnMobile: true },
    { key: "w", header: "Warranty ELR", cell: (r) => fmtRate(r.warranty.elr), align: "right", sortable: true, sortValue: (r) => r.warranty.elr ?? 0 },
    { key: "wHrs", header: "W hrs", cell: (r) => fmtNum(r.warranty.billHours, 1), align: "right", sortable: true, sortValue: (r) => r.warranty.billHours, hideOnMobile: true },
    { key: "i", header: "Internal ELR", cell: (r) => fmtRate(r.internal.elr), align: "right", sortable: true, sortValue: (r) => r.internal.elr ?? 0 },
    { key: "iHrs", header: "I hrs", cell: (r) => fmtNum(r.internal.billHours, 1), align: "right", sortable: true, sortValue: (r) => r.internal.billHours, hideOnMobile: true },
    { key: "total", header: "Total ELR", cell: (r) => <span className="font-semibold">{fmtRate(r.total.elr)}</span>, align: "right", sortable: true, sortValue: (r) => r.total.elr ?? 0 },
    { key: "totalHrs", header: "Total hrs", cell: (r) => fmtNum(r.total.billHours, 1), align: "right", sortable: true, sortValue: (r) => r.total.billHours },
  ];

  const monthCols: Column<MonthRow>[] = [
    { key: "month", header: "Month", cell: (r) => <span className="font-medium">{monthLabel(r.month)}</span>, sticky: true },
    { key: "cp", header: "Customer Pay", cell: (r) => fmtRate(r.cp), align: "right" },
    { key: "warranty", header: "Warranty", cell: (r) => fmtRate(r.warranty), align: "right" },
    { key: "internal", header: "Internal", cell: (r) => fmtRate(r.internal), align: "right" },
    { key: "total", header: "Total", cell: (r) => <span className="font-semibold">{fmtRate(r.total)}</span>, align: "right" },
    ...(data.store.isToyota
      ? ([
          { key: "txm", header: "TXM", cell: (r) => fmtRate(r.txm), align: "right", hideOnMobile: true },
          { key: "toyotaCare", header: "ToyotaCare", cell: (r) => fmtRate(r.toyotaCare), align: "right", hideOnMobile: true },
          { key: "prepaid", header: "Prepaid", cell: (r) => fmtRate(r.prepaid), align: "right", hideOnMobile: true },
        ] as Column<MonthRow>[])
      : []),
    { key: "pdi", header: "PDI", cell: (r) => fmtRate(r.pdi), align: "right", hideOnMobile: true },
  ];

  const exportAll = () => {
    const rows = [
      ...data.buckets.map((x) => ({ section: "bucket", name: x.label, elr: x.elr ?? "", laborSale: x.laborSale, billHours: x.billHours, ros: x.ros })),
      ...data.advisors.map((a) => ({ section: "advisor", name: a.name, elr: a.total.elr ?? "", laborSale: a.total.laborSale, billHours: a.total.billHours, cpElr: a.cp.elr ?? "", wElr: a.warranty.elr ?? "", iElr: a.internal.elr ?? "" })),
    ];
    downloadCsv(`${store?.abbreviation ?? "store"}-elr-${f.basis}-${f.startDate}_${f.endDate}.csv`, toCsv(rows));
  };

  const cpSpark = data.series.map((d) => ({ value: d.cp ?? 0 }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <Badge tone={windowLabel === wipDefault ? "info" : "warning"} size="sm" dot>
          {windowLabel} · {f.basis}
        </Badge>
        <span>
          WIP sheet convention for {data.store.isToyota ? "Toyota stores is YTD" : "this store is MTD"}
          {windowLabel !== wipDefault && (
            <>
              {" — "}
              <button
                className="underline underline-offset-2 hover:text-fg-strong"
                onClick={() => f.set(wipDefault === "YTD" ? { startDate: `${today.slice(0, 4)}-01-01`, endDate: today } : { startDate: monthStartOf(today), endDate: today })}
              >
                switch to {wipDefault}
              </button>
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Customer Pay ELR" value={fmtRate(b.cp?.elr)} subtext={`${fmtNum(b.cp?.billHours, 1)} hrs${data.store.isToyota ? " · excl. ToyotaCare/prepaid" : ""}`} tone="accent" spark={{ data: cpSpark }} />
        <Stat label="Warranty ELR" value={fmtRate(b.warranty?.elr)} subtext={`${fmtNum(b.warranty?.billHours, 1)} hrs`} />
        <Stat label="Internal ELR" value={fmtRate(b.internal?.elr)} subtext={`${fmtNum(b.internal?.billHours, 1)} hrs${data.store.isToyota ? " · excl. PDI" : ""}`} />
        <Stat label="Total ELR" value={fmtRate(b.total?.elr)} subtext={`${fmtNum(b.total?.billHours, 1)} hrs · ${fmtMoney(b.total?.laborSale)} labor`} tone="success" />
      </div>

      {programs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {programs.map((p) => (
            <Stat key={p.key} label={`${p.label} ELR`} value={fmtRate(p.elr)} subtext={`${fmtNum(p.billHours, 1)} hrs · ${fmtNum(p.ros)} ROs`} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>ELR by bucket</CardTitle><CardDescription>Labor sale ÷ billed hours, {windowLabel}</CardDescription></CardHeader>
          <BarChart
            title=""
            data={data.buckets.filter((x) => x.billHours > 0 && x.key !== "total").map((x) => ({ label: x.label.replace("Other make — ", "Oth "), value: x.elr ?? 0 }))}
            height={240}
            valueFormatter={(v) => fmtMoney(v, 0)}
          />
        </Card>
        <Card>
          <CardHeader><CardTitle>Customer Pay ELR trend</CardTitle><CardDescription>Trailing 12 months, by {f.basis} date</CardDescription></CardHeader>
          <BarChart title="" data={data.series.map((d) => ({ label: monthLabel(d.month), value: d.cp ?? 0 }))} height={240} valueFormatter={(v) => fmtMoney(v, 0)} color="#16a34a" />
        </Card>
      </div>

      <Card padded={false}>
        <div className="flex items-center justify-between p-4 pb-2">
          <CardHeader><CardTitle>WIP sheet rows</CardTitle><CardDescription>Same buckets as the LABOR RATES / ELR block on the AMG WIP workbook</CardDescription></CardHeader>
          <Button size="sm" variant="subtle" onClick={exportAll}>Export CSV</Button>
        </div>
        <DataTable<Bucket> columns={bucketCols} rows={[...data.buckets.filter((x) => x.group === "paytype"), ...programs, ...others]} keyField={(r) => r.key} density="compact" />
      </Card>

      <Card padded={false}>
        <div className="p-4 pb-2"><CardHeader><CardTitle>By advisor</CardTitle><CardDescription>CP / Warranty / Internal ELR per advisor (same exclusions as above)</CardDescription></CardHeader></div>
        <DataTable<AdvRow> columns={advCols} rows={data.advisors} keyField={(r) => r.advisorId || r.name} initialSort={{ key: "totalHrs", dir: "desc" }} density="compact" />
      </Card>

      <Card padded={false}>
        <div className="p-4 pb-2"><CardHeader><CardTitle>Monthly trend</CardTitle><CardDescription>Each month computed on its own (not cumulative)</CardDescription></CardHeader></div>
        <DataTable<MonthRow> columns={monthCols} rows={[...data.series].reverse()} keyField={(r) => r.month} density="compact" />
      </Card>
    </div>
  );
}
