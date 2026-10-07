"use client";

import { useEffect, useState } from "react";

import { Card, CardHeader, CardTitle, CardDescription, DataTable, Stat, Button, Input, Select, FormField, Skeleton, EmptyState, type Column } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { useReport, fmtMoney, fmtNum, toCsv, downloadCsv } from "@/lib/client/use-report";
import { useReportsCtx } from "../shell";

type Money = { laborSale: number; laborGross: number; partsSale: number; partsGross: number; total: number; billHours: number; partsQty: number };
type OpRow = { opcode: string; description: string | null; lines: number } & Money;
type AdvRow = { advisorId: string; name: string; lines: number; ros: number } & Money;
type Resp = { totalLines: number; totalRos: number; opcodes: OpRow[]; advisors: AdvRow[] };
type Line = { ro: string; openDate: string; closeDate: string | null; status: string | null; advisor: string; vehicle: string; vin: string | null; mileage: number | null; opcode: string; description: string | null; pay: string; laborSale: number; partsSale: number; total: number; billHours: number; partsQty: number };

/** Quick-pick presets. Store opcodes differ (SCT ALIGN/OKAL vs TOL 4ALIGN…) so we search by description too. */
const PRESETS: Array<{ label: string; search?: string; category?: string }> = [
  { label: "Alignments", search: "align" },
  { label: "Tires", search: "tire" },
  { label: "Brakes", search: "brake" },
  { label: "Batteries", search: "batter" },
  { label: "Cabin / air filters", search: "filter" },
  { label: "Wipers", search: "wiper" },
  { label: "Diagnostics", search: "diag" },
  { label: "Menus (TEK)", category: "MENU" },
  { label: "À la carte", category: "ALA" },
];

export default function OpcodesPage() {
  const { f, stores } = useReportsCtx();
  const store = stores.find((s) => s.id === f.storeId);
  const [search, setSearch] = useState("align");
  const [opcodes, setOpcodes] = useState("");
  const [category, setCategory] = useState("");
  const [applied, setApplied] = useState({ search: "align", opcodes: "", category: "" });
  const [drillAdvisor, setDrillAdvisor] = useState<string | null>(null);

  const extra = { search: applied.search || undefined, opcodes: applied.opcodes || undefined, category: applied.category || undefined };
  const { data, loading, error } = useReport<Resp>("opcodes", f.query, extra);
  const lines = useReport<Line[]>("lines", f.query, { ...extra, advisorId: drillAdvisor ?? undefined, limit: "1000" });
  useEffect(() => { setDrillAdvisor(null); }, [applied, f.query]);

  const apply = () => setApplied({ search: search.trim(), opcodes: opcodes.trim(), category });

  const opCols: Column<OpRow>[] = [
    { key: "opcode", header: "Opcode", cell: (r) => <span><span className="font-medium">{r.opcode}</span>{r.description && <span className="ml-2 text-[11px] text-fg-subtle">{r.description.slice(0, 60)}</span>}</span>, sortable: true, sortValue: (r) => r.opcode, sticky: true },
    { key: "lines", header: "Lines", cell: (r) => fmtNum(r.lines), sortable: true, sortValue: (r) => r.lines, align: "right" },
    { key: "partsQty", header: "Parts qty", cell: (r) => fmtNum(r.partsQty), sortable: true, sortValue: (r) => r.partsQty, align: "right", hideOnMobile: true },
    { key: "billHours", header: "Bill hrs", cell: (r) => fmtNum(r.billHours, 1), sortable: true, sortValue: (r) => r.billHours, align: "right", hideOnMobile: true },
    { key: "laborSale", header: "Labor", cell: (r) => fmtMoney(r.laborSale), sortable: true, sortValue: (r) => r.laborSale, align: "right" },
    { key: "partsSale", header: "Parts", cell: (r) => fmtMoney(r.partsSale), sortable: true, sortValue: (r) => r.partsSale, align: "right" },
    { key: "total", header: "Total", cell: (r) => <span className="font-medium">{fmtMoney(r.total)}</span>, sortable: true, sortValue: (r) => r.total, align: "right" },
  ];
  const advCols: Column<AdvRow>[] = [
    { key: "name", header: "Advisor", cell: (r) => <button className="font-medium text-accent hover:underline" onClick={() => setDrillAdvisor(drillAdvisor === r.advisorId ? null : r.advisorId)}>{r.name}</button>, sortable: true, sortValue: (r) => r.name, sticky: true },
    { key: "lines", header: "Sold (lines)", cell: (r) => <span className="font-semibold">{fmtNum(r.lines)}</span>, sortable: true, sortValue: (r) => r.lines, align: "right" },
    { key: "ros", header: "ROs", cell: (r) => fmtNum(r.ros), sortable: true, sortValue: (r) => r.ros, align: "right" },
    { key: "partsQty", header: "Parts qty", cell: (r) => fmtNum(r.partsQty), sortable: true, sortValue: (r) => r.partsQty, align: "right", hideOnMobile: true },
    { key: "billHours", header: "Bill hrs", cell: (r) => fmtNum(r.billHours, 1), sortable: true, sortValue: (r) => r.billHours, align: "right", hideOnMobile: true },
    { key: "total", header: "Revenue", cell: (r) => <span className="font-medium">{fmtMoney(r.total)}</span>, sortable: true, sortValue: (r) => r.total, align: "right" },
  ];
  const lineCols: Column<Line>[] = [
    { key: "ro", header: "RO", cell: (r) => <span className="font-medium tabular-nums">{r.ro}</span>, sortable: true, sortValue: (r) => r.ro, sticky: true },
    { key: "date", header: f.basis === "opened" ? "Opened" : "Closed", cell: (r) => (f.basis === "opened" ? r.openDate : r.closeDate) ?? "—", sortable: true, sortValue: (r) => (f.basis === "opened" ? r.openDate : r.closeDate) ?? "" },
    { key: "advisor", header: "Advisor", cell: (r) => r.advisor, sortable: true, sortValue: (r) => r.advisor },
    { key: "vehicle", header: "Vehicle", cell: (r) => <span title={r.vin ?? ""}>{r.vehicle}{r.mileage ? <span className="text-fg-subtle"> · {fmtNum(r.mileage)} mi</span> : null}</span>, hideOnMobile: true },
    { key: "opcode", header: "Opcode", cell: (r) => <span title={r.description ?? ""}>{r.opcode}</span>, sortable: true, sortValue: (r) => r.opcode },
    { key: "pay", header: "Pay", cell: (r) => r.pay, sortable: true, sortValue: (r) => r.pay, align: "center", hideOnMobile: true },
    { key: "partsQty", header: "Qty", cell: (r) => fmtNum(r.partsQty), align: "right", hideOnMobile: true },
    { key: "total", header: "Total", cell: (r) => fmtMoney(r.total), sortable: true, sortValue: (r) => r.total, align: "right" },
  ];

  const drillName = data?.advisors.find((a) => a.advisorId === drillAdvisor)?.name;

  return (
    <div className="space-y-5">
      <Card padded={false}>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-12">
          <FormField label="Search opcode or description" className="md:col-span-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} placeholder="align, tire, brake…" />
          </FormField>
          <FormField label="Exact opcodes (comma-separated)" className="md:col-span-4">
            <Input value={opcodes} onChange={(e) => setOpcodes(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} placeholder="4ALIGN, SMALIGN, TEK07030101" />
          </FormField>
          <FormField label="Category" className="md:col-span-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Any</option><option value="MENU">Menu</option><option value="ALA">À la carte</option><option value="COMMODITY">Commodity</option><option value="OTHER">Unclassified</option>
            </Select>
          </FormField>
          <div className="flex items-end md:col-span-2"><Button onClick={apply} className="w-full">Run</Button></div>
          <div className="flex flex-wrap gap-1 md:col-span-12">
            {PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="subtle" onClick={() => { setSearch(p.search ?? ""); setOpcodes(""); setCategory(p.category ?? ""); setApplied({ search: p.search ?? "", opcodes: "", category: p.category ?? "" }); }}>{p.label}</Button>
            ))}
          </div>
        </div>
      </Card>

      {error && <EmptyState title="Couldn't load report" description={error} />}
      {loading && <Skeleton className="h-64 w-full" />}
      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Lines sold" value={fmtNum(data.totalLines)} subtext={`on ${fmtNum(data.totalRos)} ROs`} tone="accent" />
            <Stat label="Revenue" value={fmtMoney(data.opcodes.reduce((s, o) => s + o.total, 0))} subtext={`labor ${fmtMoney(data.opcodes.reduce((s, o) => s + o.laborSale, 0))}`} tone="success" />
            <Stat label="Parts qty" value={fmtNum(data.opcodes.reduce((s, o) => s + o.partsQty, 0))} subtext="units on matching lines" />
            <Stat label="Billed hours" value={fmtNum(data.opcodes.reduce((s, o) => s + o.billHours, 0), 1)} />
          </div>
          {data.totalLines === 0 ? <EmptyState title="No matching operations" description="Try a broader search or a different date basis." /> : (
            <>
              <Card>
                <CardHeader><CardTitle>Sold by advisor</CardTitle><CardDescription>Click an advisor for RO-level detail</CardDescription></CardHeader>
                <BarChart title="" data={data.advisors.slice(0, 14).map((a) => ({ label: a.name.split(" ")[0], value: a.lines }))} height={200} valueFormatter={(v) => fmtNum(v)} />
              </Card>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card padded={false}>
                  <div className="flex items-center justify-between p-4 pb-2"><CardHeader><CardTitle>By advisor</CardTitle></CardHeader>
                    <Button size="sm" variant="subtle" onClick={() => downloadCsv(`${store?.abbreviation}-opcodes-by-advisor-${f.startDate}_${f.endDate}.csv`, toCsv(data.advisors.map(({ advisorId: _a, ...r }) => r)))}>CSV</Button></div>
                  <DataTable<AdvRow> columns={advCols} rows={data.advisors} keyField={(r) => r.advisorId || r.name} initialSort={{ key: "lines", dir: "desc" }} density="compact" />
                </Card>
                <Card padded={false}>
                  <div className="p-4 pb-2"><CardHeader><CardTitle>By opcode</CardTitle></CardHeader></div>
                  <DataTable<OpRow> columns={opCols} rows={data.opcodes} keyField={(r) => r.opcode} initialSort={{ key: "lines", dir: "desc" }} density="compact" />
                </Card>
              </div>
              <Card padded={false}>
                <div className="flex items-center justify-between p-4 pb-2">
                  <CardHeader><CardTitle>RO detail{drillName ? ` — ${drillName}` : ""}</CardTitle><CardDescription>{lines.data ? `${fmtNum(lines.data.length)} lines${lines.data.length >= 1000 ? " (first 1,000)" : ""}` : ""}</CardDescription></CardHeader>
                  <div className="flex gap-2">
                    {drillAdvisor && <Button size="sm" variant="subtle" onClick={() => setDrillAdvisor(null)}>All advisors</Button>}
                    <Button size="sm" variant="subtle" disabled={!lines.data} onClick={() => lines.data && downloadCsv(`${store?.abbreviation}-opcode-lines-${f.startDate}_${f.endDate}.csv`, toCsv(lines.data))}>CSV</Button>
                  </div>
                </div>
                <DataTable<Line> columns={lineCols} rows={lines.data ?? []} loading={lines.loading} keyField={(r, ) => `${r.ro}-${r.opcode}-${r.total}`} initialSort={{ key: "date", dir: "desc" }} density="compact" />
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
