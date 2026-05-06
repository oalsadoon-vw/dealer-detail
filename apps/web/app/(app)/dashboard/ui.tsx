"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { computeFullPicture } from "@/lib/fullPicture";
import { DateRangePicker } from "@/components/DateRangePicker";
import { AreaChart } from "@/components/charts/AreaChart";
import { PieChart } from "@/components/charts/PieChart";
import { AdvisorDrawer } from "@/components/AdvisorDrawer";
import { fetchApi } from "@/lib/client/fetch-api";

// --- Types ---

type Store = { id: string; name: string };
type DashboardResponse = {
  store: Store;
  businessDate: string | null;
  dateRange?: { startDate: string; endDate: string } | null;
  rangeDays?: number | null;
  run: null | {
    id: string;
    batchNo: number | null;
    status: string;
    createdAt: string;
    files: Array<{ id: string; originalFilename: string; detectedType: string | null }>;
  };
  commodityKeys: string[];
  advisors: Array<{
    advisorId: string;
    advisorName: string;
    metrics: {
      openRos: number;
      menuCount: number;
      menuLaborGross: number;
      menuPartsGross: number;
      alaCount: number;
      alaLaborGross: number;
      alaPartsGross: number;
      recCount: number;
      recSoldCount: number;
      recAmount: number;
      recSoldAmount: number;
      dailyLaborGross: number;
      dailyPartsGross: number;
    };
    commodities: Record<string, { qty: number; gross: number; laborGross: number }>;
  }>;
  dailySeries?: Array<{ date: string; openRos: number; dailyGross: number; commodityQty: number; commodityGross: number }>;
  commodityMix?: Array<{ commodityKey: string; qty: number; gross: number; laborGross: number }>;
};

const COMMODITY_ORDER: Array<{ key: string; label: string }> = [
  { key: "air_filters", label: "Air Filters" },
  { key: "cabin_filters", label: "Cabin Filters" },
  { key: "batteries", label: "Batteries" },
  { key: "tires", label: "Tires" },
  { key: "brakes", label: "Brakes" },
  { key: "alignments", label: "Alignments" },
  { key: "wipers", label: "Wipers" },
  { key: "belts", label: "Belts" },
  { key: "fluids", label: "Fluids" },
  { key: "factory_chemicals", label: "Factory Chemicals" }
];

const TABS = ["Full Picture", "Menu Sales", "A-La-Carte", "Commodity Sales", "Daily", "Closing %"] as const;
type Tab = (typeof TABS)[number];

// --- Utilities ---

function num2(x: number) {
  const v = Number.isFinite(x) ? x : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function int0(x: number) {
  const v = Number.isFinite(x) ? x : 0;
  return Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pct(x: number) {
  return `${num2((x || 0) * 100)}%`;
}
function money(x: number) {
  return (x || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function titleFromCommodityKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function safeDiv(n: number, d: number) {
  return d === 0 ? 0 : n / d;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// --- Components ---

function StatCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        key={value}
        className="num-fade mt-2 text-2xl font-bold tracking-tight text-zinc-900 tabular-nums"
      >
        {value}
      </div>
      {subtext && (
        <div key={subtext} className="num-fade mt-1 text-xs text-zinc-400">
          {subtext}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
      {description && <p className="text-sm text-zinc-500">{description}</p>}
    </div>
  );
}

function TableContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cx("px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 bg-zinc-50/50 border-b border-zinc-100", className)}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cx("px-4 py-3 text-sm text-zinc-700 border-b border-zinc-50 last:border-b-0 whitespace-nowrap", className)}>
      {children}
    </td>
  );
}

function AdvisorName({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <Td className="pl-6">
      <button
        onClick={onClick}
        className="font-medium text-zinc-900 hover:text-indigo-600 transition-colors underline decoration-transparent hover:decoration-indigo-400 underline-offset-2 text-left"
      >
        {name}
      </button>
    </Td>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-24 rounded bg-zinc-100 animate-pulse" />
      <div className="mt-3 h-7 w-32 rounded bg-zinc-100 animate-pulse" />
      <div className="mt-2 h-3 w-16 rounded bg-zinc-100 animate-pulse" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="h-4 w-32 rounded bg-zinc-100 animate-pulse" />
      <div className="mt-4 h-44 w-full rounded bg-zinc-100 animate-pulse" />
    </div>
  );
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-3">
      <div className="h-3 w-40 rounded bg-zinc-100 animate-pulse" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 w-full rounded bg-zinc-50 animate-pulse" />
      ))}
    </div>
  );
}

export default function DashboardClient({
  initialStores = [],
  initialStoreId = "",
  initialStartDate = "",
  initialEndDate = "",
  initialData = null,
}: {
  initialStores?: Store[];
  initialStoreId?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialData?: DashboardResponse | null;
}) {
  const [stores] = useState<Store[]>(initialStores);
  const [storeId, setStoreId] = useState<string>(
    initialStoreId || initialStores[0]?.id || ""
  );
  const [startDate, setStartDate] = useState<string>(initialStartDate);
  const [endDate, setEndDate] = useState<string>(initialEndDate);

  const [tab, setTab] = useState<Tab>("Full Picture");
  const [rollup, setRollup] = useState<"sum" | "avg_per_day">("sum");

  // Hydrate state from server-rendered initialData so the dashboard renders
  // populated on first paint instead of flashing a blank loading state.
  const [data, setData] = useState<DashboardResponse | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAdvisor, setSelectedAdvisor] = useState<{ id: string; name: string } | null>(null);
  const openAdvisor = useCallback((id: string, name: string) => setSelectedAdvisor({ id, name }), []);

  // Tracks whether the data currently in state matches the active filters.
  // Seeded `true` when the server pre-rendered a matching dataset; flipped
  // back to `false` whenever filters change so the next effect refetches.
  const initialMatches =
    !!initialData &&
    initialData.store?.id === (initialStoreId || initialStores[0]?.id) &&
    initialData.dateRange?.startDate === initialStartDate &&
    initialData.dateRange?.endDate === initialEndDate;
  const dataIsFreshRef = useRef<boolean>(initialMatches);

  // Fallback: if the server didn't pass dates (e.g. initial render had no
  // store), default to month-to-date once a store becomes available.
  useEffect(() => {
    if (!storeId) return;
    if (startDate && endDate) return;
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    setStartDate((prev) => prev || first.toISOString().slice(0, 10));
    setEndDate((prev) => prev || today.toISOString().slice(0, 10));
  }, [storeId, startDate, endDate]);

  useEffect(() => {
    if (!storeId || !startDate || !endDate) return;
    // First render and the SSR'd data already matches active filters —
    // skip the network round-trip entirely. Subsequent filter changes
    // (which flip `dataIsFreshRef` to false above) refetch normally.
    if (dataIsFreshRef.current) {
      dataIsFreshRef.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    fetchApi<DashboardResponse>(`/api/dashboard?storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [storeId, startDate, endDate]);

  const commodityKeys = data?.commodityKeys ?? [];
  const rangeDays = data?.rangeDays ?? null;
  const rollupDivisor = rollup === "avg_per_day" && rangeDays ? rangeDays : 1;

  const roll = (x: number) => (x || 0) / rollupDivisor;
  const fmtCount = (x: number) => (rollupDivisor === 1 ? int0(x) : num2(roll(x)));
  const fmtMoney = (x: number) => money(roll(x));

  const fullPictureRows = useMemo(() => {
    return (data?.advisors ?? []).map((a) => {
      const commArr = Object.entries(a.commodities).map(([commodityKey, v]) => ({ commodityKey, qty: v.qty, gross: v.gross }));
      const fp = computeFullPicture({
        openRos: a.metrics.openRos,
        menuCount: a.metrics.menuCount,
        alaCount: a.metrics.alaCount,
        recAmount: a.metrics.recAmount,
        recSoldAmount: a.metrics.recSoldAmount,
        dailyLaborGross: a.metrics.dailyLaborGross,
        dailyPartsGross: a.metrics.dailyPartsGross,
        commodities: commArr
      });
      return { a, fp };
    });
  }, [data]);

  const totals = useMemo(() => {
    const advisors = data?.advisors ?? [];
    const openRosTotal = advisors.reduce((sum, a) => sum + (a.metrics.openRos || 0), 0);

    const menuCountTotal = advisors.reduce((sum, a) => sum + (a.metrics.menuCount || 0), 0);
    const menuLaborGrossTotal = advisors.reduce((sum, a) => sum + (a.metrics.menuLaborGross || 0), 0);
    const menuPartsGrossTotal = advisors.reduce((sum, a) => sum + (a.metrics.menuPartsGross || 0), 0);

    const alaCountTotal = advisors.reduce((sum, a) => sum + (a.metrics.alaCount || 0), 0);
    const alaLaborGrossTotal = advisors.reduce((sum, a) => sum + (a.metrics.alaLaborGross || 0), 0);
    const alaPartsGrossTotal = advisors.reduce((sum, a) => sum + (a.metrics.alaPartsGross || 0), 0);

    const recCountTotal = advisors.reduce((sum, a) => sum + (a.metrics.recCount || 0), 0);
    const recSoldCountTotal = advisors.reduce((sum, a) => sum + (a.metrics.recSoldCount || 0), 0);
    const recAmountTotal = advisors.reduce((sum, a) => sum + (a.metrics.recAmount || 0), 0);
    const recSoldAmountTotal = advisors.reduce((sum, a) => sum + (a.metrics.recSoldAmount || 0), 0);

    const dailyLaborGrossTotal = advisors.reduce((sum, a) => sum + (a.metrics.dailyLaborGross || 0), 0);
    const dailyPartsGrossTotal = advisors.reduce((sum, a) => sum + (a.metrics.dailyPartsGross || 0), 0);
    const totalDailyGross = dailyLaborGrossTotal + dailyPartsGrossTotal;

    const commodityQtyTotal = advisors.reduce((sum, a) => sum + Object.values(a.commodities).reduce((s2, c) => s2 + (c?.qty ?? 0), 0), 0);
    const commodityPartsGrossTotal = advisors.reduce(
      (sum, a) => sum + Object.values(a.commodities).reduce((s2, c) => s2 + (c?.gross ?? 0), 0),
      0
    );
    const commodityLaborGrossTotal = advisors.reduce(
      (sum, a) => sum + Object.values(a.commodities).reduce((s2, c) => s2 + (c?.laborGross ?? 0), 0),
      0
    );
    const commodityTotalGross = commodityPartsGrossTotal + commodityLaborGrossTotal;

    const menuSalesPct = safeDiv(menuCountTotal, openRosTotal);
    const alaPct = safeDiv(alaCountTotal, openRosTotal);
    const commodityPct = safeDiv(commodityQtyTotal, openRosTotal);
    const recClosingPct = safeDiv(recSoldAmountTotal, recAmountTotal);

    return {
      openRosTotal,
      menuCountTotal, menuLaborGrossTotal, menuPartsGrossTotal, menuTotalGross: menuLaborGrossTotal + menuPartsGrossTotal, menuSalesPct,
      alaCountTotal, alaLaborGrossTotal, alaPartsGrossTotal, alaTotalGross: alaLaborGrossTotal + alaPartsGrossTotal, alaPct,
      recCountTotal, recSoldCountTotal, recAmountTotal, recSoldAmountTotal, recClosingPct,
      dailyLaborGrossTotal, dailyPartsGrossTotal, totalDailyGross,
      commodityQtyTotal, commodityPartsGrossTotal, commodityLaborGrossTotal, commodityTotalGross, commodityPct
    };
  }, [data]);

  const commodityTotalsByKey = useMemo(() => {
    const advisors = data?.advisors ?? [];
    const map: Record<string, { qty: number; partsGross: number; laborGross: number }> = {};
    for (const { key } of COMMODITY_ORDER) {
      map[key] = { qty: 0, partsGross: 0, laborGross: 0 };
    }
    for (const a of advisors) {
      for (const [k, v] of Object.entries(a.commodities)) {
        map[k] = map[k] ?? { qty: 0, partsGross: 0, laborGross: 0 };
        map[k].qty += v?.qty ?? 0;
        map[k].partsGross += v?.gross ?? 0;
        map[k].laborGross += v?.laborGross ?? 0;
      }
    }
    return map;
  }, [data]);

  const series = useMemo(() => {
    const raw = data?.dailySeries ?? [];
    if (!startDate || !endDate) return raw;

    const lookup = new Map(raw.map((d) => [d.date, d]));
    const filled: typeof raw = [];
    const cur = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      filled.push(
        lookup.get(key) ?? {
          date: key,
          openRos: 0,
          dailyGross: 0,
          commodityQty: 0,
          commodityGross: 0
        }
      );
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return filled;
  }, [data, startDate, endDate]);

  const commodityMix = data?.commodityMix ?? [];

  return (
    <main className="fade-in-up space-y-8 pb-20 min-w-0">
      {/* Header & Filters */}
      <div className="flex flex-col gap-6">
        <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-zinc-50/85 backdrop-blur-md border-b border-zinc-200/70 flex flex-wrap items-end justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-500">Performance metrics and advisor insights.</p>
          </div>

          {/* Tab control — wraps to a second line on tight widths */}
          <div className="flex flex-wrap gap-1 bg-zinc-100/80 p-1 rounded-lg max-w-full">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cx(
                  "px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-all whitespace-nowrap",
                  tab === t
                    ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5"
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 w-full">
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Store</label>
              <select
                className="w-full rounded-md border-zinc-300 py-2 text-sm shadow-sm focus:border-zinc-500 focus:ring-zinc-500"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 min-w-0 sm:col-span-2 xl:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Date Range</label>
              <div className="flex flex-wrap items-center gap-2">
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onChange={({ startDate: s, endDate: e }) => { setStartDate(s); setEndDate(e); }}
                />
                <div className="flex gap-1">
                  {[
                    {
                      label: "1M", fn: () => {
                        const now = new Date();
                        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
                        return { s: start, e: end };
                      }
                    },
                    {
                      label: "1Y", fn: () => {
                        const now = new Date();
                        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                        const start = new Date(end);
                        start.setUTCDate(start.getUTCDate() - 364);
                        return { s: start, e: end };
                      }
                    }
                  ].map(btn => (
                    <button
                      key={btn.label}
                      className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-medium hover:bg-zinc-100"
                      onClick={() => {
                        const res = btn.fn();
                        setStartDate(res.s.toISOString().slice(0, 10));
                        setEndDate(res.e.toISOString().slice(0, 10));
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Rollup</label>
              <div className="flex rounded-md shadow-sm">
                <button
                  onClick={() => setRollup("sum")}
                  className={cx("flex-1 rounded-l-md border py-2 text-xs font-medium", rollup === "sum" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50")}
                >
                  Sum
                </button>
                <button
                  onClick={() => setRollup("avg_per_day")}
                  disabled={!rangeDays}
                  className={cx("flex-1 rounded-r-md border-l-0 border py-2 text-xs font-medium", rollup === "avg_per_day" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50")}
                >
                  Avg/Day
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-100">
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div key={tab} className="min-w-0 fade-in">
        {tab === "Full Picture" && (
          loading && !data ? (
            <div className="space-y-6 min-w-0">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)}
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => <ChartSkeleton key={i} />)}
              </div>
              <TableSkeleton rows={5} />
            </div>
          ) : (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Open ROs" value={fmtCount(totals.openRosTotal)} />
              <StatCard label="Total Daily Gross" value={fmtMoney(totals.totalDailyGross)} />
              <StatCard label="Advisors Active" value={fullPictureRows.length.toString()} />

              <StatCard label="Menu Sales %" value={pct(totals.menuSalesPct)} subtext={`${fmtCount(totals.menuCountTotal)} Sold`} />
              <StatCard label="Commodity %" value={pct(totals.commodityPct)} subtext={`${fmtCount(totals.commodityQtyTotal)} Qty`} />
              <StatCard label="Rec Closing %" value={pct(totals.recClosingPct)} subtext={`${fmtMoney(totals.recSoldAmountTotal)} Sold`} />
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">

              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
                <AreaChart title="Open ROs Trend" data={series.map((d) => ({ label: d.date.slice(5), value: d.openRos }))} color="#6366f1" />
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
                <AreaChart title="Gross Trend" data={series.map((d) => ({ label: d.date.slice(5), value: d.dailyGross }))} valueFormatter={money} color="#10b981" />
              </div>
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
                <AreaChart title="Commodity Qty Trend" data={series.map((d) => ({ label: d.date.slice(5), value: d.commodityQty }))} color="#f59e0b" />
              </div>
            </div>

            <div className="space-y-4 min-w-0">
              <SectionHeading title="Advisor Performance" description="Detailed breakdown by advisor." />
              <TableContainer>
                <table className="min-w-full divide-y divide-zinc-200">
                  <thead>
                    <tr>
                      <Th className="pl-6">Advisor</Th>
                      <Th>Open ROs</Th>
                      <Th>Menu %</Th>
                      <Th>Ala %</Th>
                      <Th>Comm %</Th>
                      <Th>Rec Sold / Opp</Th>
                      <Th>Rec Close %</Th>
                      <Th className="text-right pr-6">Daily Gross</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white">
                    {fullPictureRows.map(({ a, fp }) => (
                      <tr key={a.advisorId} className="hover:bg-zinc-50/50 transition-colors">
                        <AdvisorName name={a.advisorName} onClick={() => openAdvisor(a.advisorId, a.advisorName)} />
                        <Td>{fmtCount(a.metrics.openRos)}</Td>
                        <Td>{pct(fp.menuSalesPct)} <span className="text-zinc-400 text-xs ml-1">({fmtCount(a.metrics.menuCount)})</span></Td>
                        <Td>{pct(fp.alaPct)} <span className="text-zinc-400 text-xs ml-1">({fmtCount(a.metrics.alaCount)})</span></Td>
                        <Td>{pct(fp.commodityPct)} <span className="text-zinc-400 text-xs ml-1">({fmtCount(fp.commodityQtyTotal)})</span></Td>
                        <Td className="text-zinc-600">{fmtMoney(a.metrics.recSoldAmount)} <span className="text-zinc-400">/ {fmtMoney(a.metrics.recAmount)}</span></Td>
                        <Td>
                          <span className={cx(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            fp.recClosingPct >= 0.5 ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-700"
                          )}>
                            {pct(fp.recClosingPct)}
                          </span>
                        </Td>
                        <Td className="text-right pr-6 font-medium text-zinc-900">{fmtMoney(fp.totalDailyGross)}</Td>
                      </tr>
                    ))}
                    {!loading && data && data.advisors.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-zinc-600">No data available for this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </TableContainer>
            </div>
          </div>
          )
        )}

        {tab === "Menu Sales" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Menu Count" value={fmtCount(totals.menuCountTotal)} />
              <StatCard label="Sales %" value={pct(totals.menuSalesPct)} />
              <StatCard label="Labor Gross" value={fmtMoney(totals.menuLaborGrossTotal)} />
              <StatCard label="Total Gross" value={fmtMoney(totals.menuTotalGross)} />
            </div>

            <TableContainer>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <Th className="pl-6">Advisor</Th>
                    <Th>Count</Th>
                    <Th>Labor Gross</Th>
                    <Th>Parts Gross</Th>
                    <Th className="text-right pr-6">Total Gross</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.advisors ?? []).map((a) => (
                    <tr key={a.advisorId} className="hover:bg-zinc-50/50">
                      <AdvisorName name={a.advisorName} onClick={() => openAdvisor(a.advisorId, a.advisorName)} />
                      <Td>{fmtCount(a.metrics.menuCount)}</Td>
                      <Td>{fmtMoney(a.metrics.menuLaborGross)}</Td>
                      <Td>{fmtMoney(a.metrics.menuPartsGross)}</Td>
                      <Td className="text-right pr-6 font-medium">{fmtMoney((a.metrics.menuLaborGross || 0) + (a.metrics.menuPartsGross || 0))}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          </div>
        )}

        {tab === "A-La-Carte" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="ALC Count" value={fmtCount(totals.alaCountTotal)} />
              <StatCard label="Sales %" value={pct(totals.alaPct)} />
              <StatCard label="Labor Gross" value={fmtMoney(totals.alaLaborGrossTotal)} />
              <StatCard label="Total Gross" value={fmtMoney(totals.alaTotalGross)} />
            </div>
            <TableContainer>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <Th className="pl-6">Advisor</Th>
                    <Th>Count</Th>
                    <Th>Labor Gross</Th>
                    <Th>Parts Gross</Th>
                    <Th className="text-right pr-6">Total Gross</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.advisors ?? []).map((a) => (
                    <tr key={a.advisorId} className="hover:bg-zinc-50/50">
                      <AdvisorName name={a.advisorName} onClick={() => openAdvisor(a.advisorId, a.advisorName)} />
                      <Td>{fmtCount(a.metrics.alaCount)}</Td>
                      <Td>{fmtMoney(a.metrics.alaLaborGross)}</Td>
                      <Td>{fmtMoney(a.metrics.alaPartsGross)}</Td>
                      <Td className="text-right pr-6 font-medium">{fmtMoney((a.metrics.alaLaborGross || 0) + (a.metrics.alaPartsGross || 0))}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          </div>
        )}

        {tab === "Commodity Sales" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm min-w-0">
                <PieChart
                  title="Commodity Mix"
                  data={COMMODITY_ORDER.map(({ key, label }) => ({
                    label,
                    value: commodityMix.find(x => x.commodityKey === key)?.qty ?? 0
                  }))}
                  valueFormatter={(v) => int0(v)}
                />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <StatCard label="Total Qty" value={fmtCount(totals.commodityQtyTotal)} />
                <StatCard label="Total Gross" value={fmtMoney(totals.commodityTotalGross)} />
                <StatCard label="Labor Gross" value={fmtMoney(totals.commodityLaborGrossTotal)} />
                <StatCard label="Parts Gross" value={fmtMoney(totals.commodityPartsGrossTotal)} />
              </div>
            </div>

            <TableContainer>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <Th className="pl-6">Commodity</Th>
                    <Th>Qty</Th>
                    <Th>Parts Gross</Th>
                    <Th>Labor Gross</Th>
                    <Th className="text-right pr-6">Total Gross</Th>
                  </tr>
                </thead>
                <tbody>
                  {COMMODITY_ORDER.map(({ key, label }) => {
                    const t = commodityTotalsByKey[key] ?? { qty: 0, partsGross: 0, laborGross: 0 };
                    return (
                      <tr key={key} className="hover:bg-zinc-50/50">
                        <Td className="pl-6 font-medium text-zinc-900">{label}</Td>
                        <Td>{fmtCount(t.qty)}</Td>
                        <Td>{fmtMoney(t.partsGross)}</Td>
                        <Td>{fmtMoney(t.laborGross)}</Td>
                        <Td className="text-right pr-6 font-medium">{fmtMoney(t.partsGross + t.laborGross)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableContainer>
          </div>
        )}

        {tab === "Closing %" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Closing %" value={pct(totals.recClosingPct)} />
              <StatCard label="Rec Amount" value={fmtMoney(totals.recAmountTotal)} />
              <StatCard label="Sold Amount" value={fmtMoney(totals.recSoldAmountTotal)} />
            </div>
            <TableContainer>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <Th className="pl-6">Advisor</Th>
                    <Th>Rec Count</Th>
                    <Th>Rec Sold</Th>
                    <Th>Opportunity</Th>
                    <Th className="text-right pr-6">Close %</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.advisors ?? []).map((a) => {
                    const close = a.metrics.recAmount === 0 ? 0 : a.metrics.recSoldAmount / a.metrics.recAmount;
                    return (
                      <tr key={a.advisorId} className="hover:bg-zinc-50/50">
                        <AdvisorName name={a.advisorName} onClick={() => openAdvisor(a.advisorId, a.advisorName)} />
                        <Td>{fmtCount(a.metrics.recCount)}</Td>
                        <Td>{fmtCount(a.metrics.recSoldCount)}</Td>
                        <Td>
                          {fmtMoney(a.metrics.recSoldAmount)} <span className="text-zinc-400">/ {fmtMoney(a.metrics.recAmount)}</span>
                        </Td>
                        <Td className="text-right pr-6">
                          <span className={cx("inline-block px-2 py-0.5 rounded-full text-xs font-medium", close >= 0.5 ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-700")}>
                            {pct(close)}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableContainer>
          </div>
        )}

        {tab === "Daily" && (
          <TableContainer>
            <table className="min-w-full">
              <thead>
                <tr>
                  <Th className="pl-6">Advisor</Th>
                  <Th>Labor Gross</Th>
                  <Th>Parts Gross</Th>
                  <Th className="text-right pr-6">Total Daily Gross</Th>
                </tr>
              </thead>
              <tbody>
                {(data?.advisors ?? []).map((a) => (
                  <tr key={a.advisorId} className="hover:bg-zinc-50/50">
                    <AdvisorName name={a.advisorName} onClick={() => openAdvisor(a.advisorId, a.advisorName)} />
                    <Td>{money(a.metrics.dailyLaborGross)}</Td>
                    <Td>{money(a.metrics.dailyPartsGross)}</Td>
                    <Td className="text-right pr-6 font-medium">{money(a.metrics.dailyLaborGross + a.metrics.dailyPartsGross)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableContainer>
        )}
      </div>

      {selectedAdvisor && (
        <AdvisorDrawer
          advisorId={selectedAdvisor.id}
          advisorName={selectedAdvisor.name}
          storeId={storeId}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSelectedAdvisor(null)}
        />
      )}
    </main>
  );
}
