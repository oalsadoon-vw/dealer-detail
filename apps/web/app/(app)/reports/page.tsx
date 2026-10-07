"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Card, CardHeader, CardTitle, CardDescription, Stat, Skeleton, EmptyState, Badge } from "@/components/ui";
import { AreaChart } from "@/components/charts/AreaChart";
import { BarChart } from "@/components/charts/BarChart";
import { PieChart } from "@/components/charts/PieChart";
import { useReport, fmtMoney, fmtNum, fmtPct, fmtDateShort } from "@/lib/client/use-report";
import { reportHref } from "@/lib/client/report-filters";
import { useReportsCtx } from "./shell";

type Summary = {
  totals: {
    roCount: number; closedCount: number; openCount: number; cpRoCount: number;
    laborSale: number; laborGross: number; partsSale: number; partsGross: number;
    totalSale: number; totalGross: number; billHours: number; elr: number; hoursPerRo: number; salePerRo: number;
    menuRos: number; menuPenetration: number;
    cp: { laborSale: number; partsSale: number; billHours: number };
    warranty: { laborSale: number; partsSale: number; billHours: number };
    internal: { laborSale: number; partsSale: number; billHours: number };
    other: { laborSale: number; partsSale: number; billHours: number };
  };
  series: Array<{ date: string; roCount: number; laborSale: number; partsSale: number; laborGross: number; partsGross: number; billHours: number; menuRos: number }>;
  lastSyncAt: string | null;
};

export default function OverviewPage() {
  const { f } = useReportsCtx();
  const { data, loading, error } = useReport<Summary>("summary", f.query);
  const t = data?.totals;
  const rangeDays = data?.series.length ?? 0;

  const payMix = useMemo(() => t ? [
    { label: "Customer Pay", value: t.cp.laborSale + t.cp.partsSale, color: "#2563eb" },
    { label: "Warranty", value: t.warranty.laborSale + t.warranty.partsSale, color: "#16a34a" },
    { label: "Internal", value: t.internal.laborSale + t.internal.partsSale, color: "#f59e0b" },
    { label: "Other / Plans", value: t.other.laborSale + t.other.partsSale, color: "#8b5cf6" },
  ].filter((d) => d.value > 0) : [], [t]);

  if (error) return <EmptyState title="Couldn't load report" description={error} />;
  if (loading || !data || !t) return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (t.roCount === 0) return <EmptyState title="No repair orders in this range" description={`No ROs ${f.basis === "opened" ? "opened" : "closed"} between ${fmtDateShort(f.startDate)} and ${fmtDateShort(f.endDate)}. ${data.lastSyncAt ? "" : "This store hasn't synced from Tekion yet."}`} />;

  const spark = (k: keyof Summary["series"][number]) => ({ data: data.series.map((d) => ({ value: Number(d[k]) })) });
  const basisWord = f.basis === "opened" ? "opened" : "closed";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Badge tone="info" size="sm" dot>API</Badge>
        <span>{fmtNum(t.roCount)} ROs {basisWord} · {fmtDateShort(f.startDate)} – {fmtDateShort(f.endDate)}{data.lastSyncAt ? ` · synced ${new Date(data.lastSyncAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`ROs ${basisWord}`} value={fmtNum(t.roCount)} subtext={f.basis === "opened" ? `${fmtNum(t.closedCount)} since closed · ${fmtNum(t.openCount)} still open` : `${fmtNum(t.cpRoCount)} customer-pay`} spark={spark("roCount")} />
        <Stat label="Total sale" value={fmtMoney(t.totalSale)} subtext={`${fmtMoney(t.salePerRo)} / RO`} spark={spark("laborSale")} tone="accent" />
        <Stat label="Labor sale" value={fmtMoney(t.laborSale)} subtext={`gross ${fmtMoney(t.laborGross)}`} />
        <Stat label="Parts sale" value={fmtMoney(t.partsSale)} subtext={`gross ${fmtMoney(t.partsGross)}`} />
        <Stat label="Billed hours" value={fmtNum(t.billHours, 1)} subtext={`${fmtNum(t.hoursPerRo, 2)} hrs / RO`} spark={spark("billHours")} />
        <Stat label="Effective labor rate" value={fmtMoney(t.elr, 2)} subtext="labor sale ÷ billed hours" />
        <Stat label="RO gross" value={fmtMoney(t.totalGross)} subtext="labor + parts (sale − cost) on RO lines" tone="success" />
        <Stat label="Menu penetration" value={fmtPct(t.menuPenetration)} subtext={`${fmtNum(t.menuRos)} ROs with a factory menu`} spark={spark("menuRos")} />
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>ROs per day</CardTitle>
            <CardDescription>{f.basis === "opened" ? "Opened (check-in / created date)" : "Closed (close date)"}</CardDescription>
          </CardHeader>
          <BarChart title="" data={data.series.map((d) => ({ label: fmtDateShort(d.date), value: d.roCount }))} height={220} valueFormatter={(v) => fmtNum(v)} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sales by pay type</CardTitle>
            <CardDescription>Labor + parts sale</CardDescription>
          </CardHeader>
          <PieChart title="" data={payMix} valueFormatter={(v) => fmtMoney(v)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Labor sale per day</CardTitle></CardHeader>
          <AreaChart title="" data={data.series.map((d) => ({ label: fmtDateShort(d.date), value: d.laborSale }))} height={200} valueFormatter={(v) => fmtMoney(v)} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Billed hours per day</CardTitle></CardHeader>
          <AreaChart title="" data={data.series.map((d) => ({ label: fmtDateShort(d.date), value: d.billHours }))} height={200} valueFormatter={(v) => fmtNum(v, 1)} color="#16a34a" />
        </Card>
      </div>

      {/* Pay type table */}
      <Card padded={false}>
        <div className="p-4 pb-0"><CardHeader><CardTitle>Pay type breakdown</CardTitle><CardDescription>{rangeDays} day{rangeDays === 1 ? "" : "s"} in range</CardDescription></CardHeader></div>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
            <tr className="border-b border-line"><th className="px-4 py-2">Pay type</th><th className="px-4 py-2 text-right">Labor sale</th><th className="px-4 py-2 text-right">Parts sale</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Billed hrs</th><th className="px-4 py-2 text-right">ELR</th></tr>
          </thead>
          <tbody>
            {([["Customer Pay", t.cp], ["Warranty", t.warranty], ["Internal", t.internal], ["Other / Service Plans", t.other]] as const).map(([name, v]) => (
              <tr key={name} className="border-b border-line/60">
                <td className="px-4 py-2 font-medium">{name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(v.laborSale)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(v.partsSale)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{fmtMoney(v.laborSale + v.partsSale)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtNum(v.billHours, 1)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{v.billHours ? fmtMoney(v.laborSale / v.billHours, 2) : "—"}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(t.laborSale)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(t.partsSale)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(t.totalSale)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtNum(t.billHours, 1)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(t.elr, 2)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-accent hover:underline" href={reportHref("/reports/advisors", f)}>Advisor performance →</Link>
        <Link className="text-accent hover:underline" href={reportHref("/reports/menu", f)}>Menu sales →</Link>
        <Link className="text-accent hover:underline" href={reportHref("/reports/ros", f)}>Every RO in this range →</Link>
      </div>
      <p className="text-[11px] text-fg-subtle">
        "RO gross" is labor + parts (sale − cost) off repair-order lines; it is not the financial-statement gross, which is a GL posting figure that also carries adjustments, policy and sublet.
      </p>
    </div>
  );
}
