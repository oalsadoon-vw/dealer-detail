"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { computeFullPicture } from "@/lib/fullPicture";
import { DateRangePicker } from "@/components/DateRangePicker";
import { AreaChart } from "@/components/charts/AreaChart";
import { PieChart } from "@/components/charts/PieChart";
import { AdvisorDrawer } from "@/components/AdvisorDrawer";
import { fetchApi } from "@/lib/client/fetch-api";
import {
  Card,
  Stat,
  Tabs,
  type Tab,
  Button,
  Badge,
  FormField,
  Select,
  SectionHeading,
  DataTable,
  type Column,
  Skeleton,
  EmptyState,
} from "@/components/ui";

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

type TabId =
  | "full_picture"
  | "menu_sales"
  | "ala_carte"
  | "commodity"
  | "daily"
  | "closing";

const TABS: Tab<TabId>[] = [
  { id: "full_picture", label: "Full Picture" },
  { id: "menu_sales", label: "Menu Sales" },
  { id: "ala_carte", label: "A-La-Carte" },
  { id: "commodity", label: "Commodity Sales" },
  { id: "daily", label: "Daily" },
  { id: "closing", label: "Closing %" },
];

// --- Utilities ---

function num2(x: number) {
  const v = Number.isFinite(x) ? x : 0;
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function int0(x: number) {
  const v = Number.isFinite(x) ? x : 0;
  return Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pct(x: number) {
  return `${num2((x || 0) * 100)}%`;
}

// "Commodity per RO" is an attach rate that legitimately exceeds 1.0
// (one RO can include many commodity items). Display as a 2-decimal
// multiplier instead of a percentage so values like "1725%" don't
// read as broken. Mirrors the same convention in AdvisorDrawer.
function ratio(x: number) {
  return num2(x || 0);
}

function money(x: number) {
  return (x || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeDiv(n: number, d: number) {
  return d === 0 ? 0 : n / d;
}

// --- Page ---

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

  const [tab, setTab] = useState<TabId>("full_picture");
  const [rollup, setRollup] = useState<"sum" | "avg_per_day">("sum");

  const [data, setData] = useState<DashboardResponse | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAdvisor, setSelectedAdvisor] = useState<{ id: string; name: string } | null>(null);
  const openAdvisor = useCallback(
    (id: string, name: string) => setSelectedAdvisor({ id, name }),
    []
  );

  const initialMatches =
    !!initialData &&
    initialData.store?.id === (initialStoreId || initialStores[0]?.id) &&
    initialData.dateRange?.startDate === initialStartDate &&
    initialData.dateRange?.endDate === initialEndDate;
  const dataIsFreshRef = useRef<boolean>(initialMatches);

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
    if (dataIsFreshRef.current) {
      dataIsFreshRef.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    fetchApi<DashboardResponse>(
      `/api/dashboard?storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`
    )
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [storeId, startDate, endDate]);

  const rangeDays = data?.rangeDays ?? null;
  const rollupDivisor = rollup === "avg_per_day" && rangeDays ? rangeDays : 1;
  const roll = (x: number) => (x || 0) / rollupDivisor;
  const fmtCount = (x: number) => (rollupDivisor === 1 ? int0(x) : num2(roll(x)));
  const fmtMoney = (x: number) => money(roll(x));

  const fullPictureRows = useMemo(() => {
    return (data?.advisors ?? []).map((a) => {
      const commArr = Object.entries(a.commodities).map(([commodityKey, v]) => ({
        commodityKey,
        qty: v.qty,
        gross: v.gross,
      }));
      const fp = computeFullPicture({
        openRos: a.metrics.openRos,
        menuCount: a.metrics.menuCount,
        alaCount: a.metrics.alaCount,
        recAmount: a.metrics.recAmount,
        recSoldAmount: a.metrics.recSoldAmount,
        dailyLaborGross: a.metrics.dailyLaborGross,
        dailyPartsGross: a.metrics.dailyPartsGross,
        commodities: commArr,
      });
      return { a, fp };
    });
  }, [data]);

  const totals = useMemo(() => {
    const advisors = data?.advisors ?? [];
    const sumBy = <T,>(fn: (a: (typeof advisors)[number]) => T) =>
      advisors.reduce((s, a) => (typeof fn(a) === "number" ? (s as number) + (fn(a) as unknown as number) : s), 0 as number);

    const openRosTotal = sumBy((a) => a.metrics.openRos || 0);
    const menuCountTotal = sumBy((a) => a.metrics.menuCount || 0);
    const menuLaborGrossTotal = sumBy((a) => a.metrics.menuLaborGross || 0);
    const menuPartsGrossTotal = sumBy((a) => a.metrics.menuPartsGross || 0);
    const alaCountTotal = sumBy((a) => a.metrics.alaCount || 0);
    const alaLaborGrossTotal = sumBy((a) => a.metrics.alaLaborGross || 0);
    const alaPartsGrossTotal = sumBy((a) => a.metrics.alaPartsGross || 0);
    const recCountTotal = sumBy((a) => a.metrics.recCount || 0);
    const recSoldCountTotal = sumBy((a) => a.metrics.recSoldCount || 0);
    const recAmountTotal = sumBy((a) => a.metrics.recAmount || 0);
    const recSoldAmountTotal = sumBy((a) => a.metrics.recSoldAmount || 0);
    const dailyLaborGrossTotal = sumBy((a) => a.metrics.dailyLaborGross || 0);
    const dailyPartsGrossTotal = sumBy((a) => a.metrics.dailyPartsGross || 0);
    const totalDailyGross = dailyLaborGrossTotal + dailyPartsGrossTotal;

    const commodityQtyTotal = advisors.reduce(
      (sum, a) => sum + Object.values(a.commodities).reduce((s2, c) => s2 + (c?.qty ?? 0), 0),
      0
    );
    const commodityPartsGrossTotal = advisors.reduce(
      (sum, a) => sum + Object.values(a.commodities).reduce((s2, c) => s2 + (c?.gross ?? 0), 0),
      0
    );
    const commodityLaborGrossTotal = advisors.reduce(
      (sum, a) => sum + Object.values(a.commodities).reduce((s2, c) => s2 + (c?.laborGross ?? 0), 0),
      0
    );
    const commodityTotalGross = commodityPartsGrossTotal + commodityLaborGrossTotal;

    return {
      openRosTotal,
      menuCountTotal, menuLaborGrossTotal, menuPartsGrossTotal,
      menuTotalGross: menuLaborGrossTotal + menuPartsGrossTotal,
      menuSalesPct: safeDiv(menuCountTotal, openRosTotal),
      alaCountTotal, alaLaborGrossTotal, alaPartsGrossTotal,
      alaTotalGross: alaLaborGrossTotal + alaPartsGrossTotal,
      alaPct: safeDiv(alaCountTotal, openRosTotal),
      recCountTotal, recSoldCountTotal, recAmountTotal, recSoldAmountTotal,
      recClosingPct: safeDiv(recSoldAmountTotal, recAmountTotal),
      dailyLaborGrossTotal, dailyPartsGrossTotal, totalDailyGross,
      commodityQtyTotal, commodityPartsGrossTotal, commodityLaborGrossTotal, commodityTotalGross,
      commodityPct: safeDiv(commodityQtyTotal, openRosTotal),
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
          commodityGross: 0,
        }
      );
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return filled;
  }, [data, startDate, endDate]);

  const commodityMix = data?.commodityMix ?? [];

  const sparkOpenRos = series.map((d) => ({ value: d.openRos }));
  const sparkGross = series.map((d) => ({ value: d.dailyGross }));
  const sparkComm = series.map((d) => ({ value: d.commodityQty }));

  return (
    <main className="fade-in-up space-y-6 pb-20 min-w-0">
      {/* Header & Filters */}
      <div className="flex flex-col gap-4">
        <SectionHeading
          title="Dashboard"
          description="Performance metrics and advisor insights."
          size="page"
        />

        <Tabs<TabId>
          tabs={TABS}
          value={tab}
          onChange={setTab}
          variant="underline"
        />

        {/* Filter Bar */}
        <Card padded={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-4">
            <FormField label="Store">
              <Select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Date Range"
              className="sm:col-span-2 xl:col-span-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onChange={({ startDate: s, endDate: e }) => {
                    setStartDate(s);
                    setEndDate(e);
                  }}
                />
                <div className="flex gap-1">
                  {[
                    {
                      label: "1M",
                      fn: () => {
                        const now = new Date();
                        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
                        return { s: start, e: end };
                      },
                    },
                    {
                      label: "1Y",
                      fn: () => {
                        const now = new Date();
                        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
                        const start = new Date(end);
                        start.setUTCDate(start.getUTCDate() - 364);
                        return { s: start, e: end };
                      },
                    },
                  ].map((btn) => (
                    <Button
                      key={btn.label}
                      size="sm"
                      variant="subtle"
                      onClick={() => {
                        const res = btn.fn();
                        setStartDate(res.s.toISOString().slice(0, 10));
                        setEndDate(res.e.toISOString().slice(0, 10));
                      }}
                    >
                      {btn.label}
                    </Button>
                  ))}
                </div>
              </div>
            </FormField>

            <FormField label="Rollup">
              <Tabs
                tabs={[
                  { id: "sum", label: "Sum" },
                  { id: "avg_per_day", label: "Avg / Day", disabled: !rangeDays },
                ]}
                value={rollup}
                onChange={(v) => setRollup(v as typeof rollup)}
                variant="segmented"
              />
            </FormField>
          </div>
        </Card>

        {error && (
          <div className="rounded-lg bg-danger-soft border border-danger/20 p-3 text-sm text-danger">
            <strong className="font-semibold">Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Tab content */}
      <div key={tab} className="min-w-0 fade-in space-y-6">
        {tab === "full_picture" && (
          loading && !data ? (
            <DashboardSkeleton />
          ) : (
            <div className="space-y-6 min-w-0">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                <Stat
                  label="Open ROs"
                  value={fmtCount(totals.openRosTotal)}
                  spark={sparkOpenRos.length > 1 ? { data: sparkOpenRos } : undefined}
                />
                <Stat
                  label="Total Daily Gross"
                  value={fmtMoney(totals.totalDailyGross)}
                  tone="success"
                  spark={
                    sparkGross.length > 1
                      ? { data: sparkGross, color: "rgb(var(--success))" }
                      : undefined
                  }
                />
                <Stat
                  label="Advisors Active"
                  value={fullPictureRows.length.toString()}
                />
                <Stat
                  label="Menu Sales %"
                  value={pct(totals.menuSalesPct)}
                  subtext={`${fmtCount(totals.menuCountTotal)} sold`}
                />
                <Stat
                  label="Comm / RO"
                  value={ratio(totals.commodityPct)}
                  subtext={`${fmtCount(totals.commodityQtyTotal)} qty`}
                  spark={
                    sparkComm.length > 1
                      ? { data: sparkComm, color: "rgb(var(--warning))" }
                      : undefined
                  }
                />
                <Stat
                  label="Rec Closing %"
                  value={pct(totals.recClosingPct)}
                  subtext={`${fmtMoney(totals.recSoldAmountTotal)} sold`}
                  tone={totals.recClosingPct >= 0.5 ? "success" : "neutral"}
                />
              </div>

              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <AreaChart
                    title="Open ROs Trend"
                    data={series.map((d) => ({ label: d.date.slice(5), value: d.openRos }))}
                    color="rgb(var(--accent))"
                  />
                </Card>
                <Card>
                  <AreaChart
                    title="Gross Trend"
                    data={series.map((d) => ({ label: d.date.slice(5), value: d.dailyGross }))}
                    color="rgb(var(--success))"
                    valueFormatter={money}
                  />
                </Card>
                <Card>
                  <AreaChart
                    title="Commodity Qty Trend"
                    data={series.map((d) => ({ label: d.date.slice(5), value: d.commodityQty }))}
                    color="rgb(var(--warning))"
                  />
                </Card>
              </div>

              <div className="space-y-3 min-w-0">
                <SectionHeading
                  title="Advisor Performance"
                  description="Detailed breakdown by advisor."
                />
                <DataTable
                  columns={fullPictureColumns(fmtCount, fmtMoney, openAdvisor)}
                  rows={fullPictureRows}
                  keyField={(r) => r.a.advisorId}
                  initialSort={{ key: "daily_gross", dir: "desc" }}
                  empty={
                    <EmptyState
                      title="No advisors in this range"
                      description="Pick a different date range or store."
                    />
                  }
                />
              </div>
            </div>
          )
        )}

        {tab === "menu_sales" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Menu Count" value={fmtCount(totals.menuCountTotal)} />
              <Stat label="Sales %" value={pct(totals.menuSalesPct)} />
              <Stat label="Labor Gross" value={fmtMoney(totals.menuLaborGrossTotal)} />
              <Stat label="Total Gross" value={fmtMoney(totals.menuTotalGross)} tone="success" />
            </div>
            <DataTable
              columns={advisorBreakdownColumns(
                "menu",
                fmtCount,
                fmtMoney,
                openAdvisor
              )}
              rows={data?.advisors ?? []}
              keyField={(a) => a.advisorId}
            />
          </div>
        )}

        {tab === "ala_carte" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="ALC Count" value={fmtCount(totals.alaCountTotal)} />
              <Stat label="Sales %" value={pct(totals.alaPct)} />
              <Stat label="Labor Gross" value={fmtMoney(totals.alaLaborGrossTotal)} />
              <Stat label="Total Gross" value={fmtMoney(totals.alaTotalGross)} tone="success" />
            </div>
            <DataTable
              columns={advisorBreakdownColumns(
                "ala",
                fmtCount,
                fmtMoney,
                openAdvisor
              )}
              rows={data?.advisors ?? []}
              keyField={(a) => a.advisorId}
            />
          </div>
        )}

        {tab === "commodity" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card>
                <PieChart
                  title="Commodity Mix"
                  data={COMMODITY_ORDER.map(({ key, label }) => ({
                    label,
                    value:
                      commodityMix.find((x) => x.commodityKey === key)?.qty ?? 0,
                  }))}
                  valueFormatter={int0}
                />
              </Card>
              <div className="grid gap-4 grid-cols-2 content-start">
                <Stat label="Total Qty" value={fmtCount(totals.commodityQtyTotal)} />
                <Stat label="Total Gross" value={fmtMoney(totals.commodityTotalGross)} tone="success" />
                <Stat label="Labor Gross" value={fmtMoney(totals.commodityLaborGrossTotal)} />
                <Stat label="Parts Gross" value={fmtMoney(totals.commodityPartsGrossTotal)} />
              </div>
            </div>

            <DataTable
              columns={commodityColumns(fmtCount, fmtMoney)}
              rows={COMMODITY_ORDER.map(({ key, label }) => ({
                key,
                label,
                ...(commodityTotalsByKey[key] ?? {
                  qty: 0,
                  partsGross: 0,
                  laborGross: 0,
                }),
              }))}
              keyField={(r) => r.key}
              initialSort={{ key: "total", dir: "desc" }}
            />
          </div>
        )}

        {tab === "closing" && (
          <div className="space-y-6 min-w-0">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              <Stat
                label="Closing %"
                value={pct(totals.recClosingPct)}
                tone={totals.recClosingPct >= 0.5 ? "success" : "neutral"}
              />
              <Stat label="Rec Amount" value={fmtMoney(totals.recAmountTotal)} />
              <Stat label="Sold Amount" value={fmtMoney(totals.recSoldAmountTotal)} tone="success" />
            </div>
            <DataTable
              columns={closingColumns(fmtCount, fmtMoney, openAdvisor)}
              rows={data?.advisors ?? []}
              keyField={(a) => a.advisorId}
            />
          </div>
        )}

        {tab === "daily" && (
          <DataTable
            columns={dailyColumns(openAdvisor)}
            rows={data?.advisors ?? []}
            keyField={(a) => a.advisorId}
            initialSort={{ key: "total", dir: "desc" }}
          />
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

// --- Column factories ---
// Pulled out of the JSX so each tab's table is a single line. Each factory
// is a pure function over the formatter funcs + advisor click handler.

type FpRow = { a: DashboardResponse["advisors"][number]; fp: ReturnType<typeof computeFullPicture> };

function fullPictureColumns(
  fmtCount: (n: number) => string,
  fmtMoney: (n: number) => string,
  openAdvisor: (id: string, name: string) => void
): Column<FpRow>[] {
  return [
    {
      key: "advisor",
      header: "Advisor",
      sortable: true,
      sortValue: (r) => r.a.advisorName,
      cell: (r) => (
        <button
          onClick={() => openAdvisor(r.a.advisorId, r.a.advisorName)}
          className="font-medium text-fg-strong hover:text-accent transition-colors text-left"
        >
          {r.a.advisorName}
        </button>
      ),
      sticky: true,
    },
    {
      key: "open_ros",
      header: "Open ROs",
      sortable: true,
      sortValue: (r) => r.a.metrics.openRos,
      cell: (r) => fmtCount(r.a.metrics.openRos),
    },
    {
      key: "menu_pct",
      header: "Menu %",
      sortable: true,
      sortValue: (r) => r.fp.menuSalesPct,
      cell: (r) => (
        <>
          {`${num2(r.fp.menuSalesPct * 100)}%`}{" "}
          <span className="text-fg-subtle text-xs ml-1">
            ({fmtCount(r.a.metrics.menuCount)})
          </span>
        </>
      ),
    },
    {
      key: "ala_pct",
      header: "Ala %",
      sortable: true,
      sortValue: (r) => r.fp.alaPct,
      cell: (r) => (
        <>
          {`${num2(r.fp.alaPct * 100)}%`}{" "}
          <span className="text-fg-subtle text-xs ml-1">
            ({fmtCount(r.a.metrics.alaCount)})
          </span>
        </>
      ),
    },
    {
      key: "comm_ratio",
      header: "Comm / RO",
      sortable: true,
      sortValue: (r) => r.fp.commodityPct,
      cell: (r) => (
        <>
          {ratio(r.fp.commodityPct)}{" "}
          <span className="text-fg-subtle text-xs ml-1">
            ({fmtCount(r.fp.commodityQtyTotal)})
          </span>
        </>
      ),
    },
    {
      key: "rec_pair",
      header: "Rec Sold / Opp",
      align: "left",
      cell: (r) => (
        <>
          {fmtMoney(r.a.metrics.recSoldAmount)}{" "}
          <span className="text-fg-subtle">
            / {fmtMoney(r.a.metrics.recAmount)}
          </span>
        </>
      ),
    },
    {
      key: "rec_close",
      header: "Rec Close %",
      sortable: true,
      sortValue: (r) => r.fp.recClosingPct,
      cell: (r) => (
        <Badge
          tone={r.fp.recClosingPct >= 0.5 ? "success" : "neutral"}
          size="md"
        >
          {`${num2(r.fp.recClosingPct * 100)}%`}
        </Badge>
      ),
    },
    {
      key: "daily_gross",
      header: "Daily Gross",
      align: "right",
      sortable: true,
      sortValue: (r) => r.fp.totalDailyGross,
      cell: (r) => (
        <span className="font-semibold text-fg-strong">
          {fmtMoney(r.fp.totalDailyGross)}
        </span>
      ),
    },
  ];
}

type AdvisorRow = DashboardResponse["advisors"][number];

function advisorBreakdownColumns(
  kind: "menu" | "ala",
  fmtCount: (n: number) => string,
  fmtMoney: (n: number) => string,
  openAdvisor: (id: string, name: string) => void
): Column<AdvisorRow>[] {
  const labor = (a: AdvisorRow) =>
    kind === "menu" ? a.metrics.menuLaborGross : a.metrics.alaLaborGross;
  const parts = (a: AdvisorRow) =>
    kind === "menu" ? a.metrics.menuPartsGross : a.metrics.alaPartsGross;
  const count = (a: AdvisorRow) =>
    kind === "menu" ? a.metrics.menuCount : a.metrics.alaCount;

  return [
    {
      key: "advisor",
      header: "Advisor",
      sortable: true,
      sortValue: (a) => a.advisorName,
      cell: (a) => (
        <button
          onClick={() => openAdvisor(a.advisorId, a.advisorName)}
          className="font-medium text-fg-strong hover:text-accent transition-colors text-left"
        >
          {a.advisorName}
        </button>
      ),
      sticky: true,
    },
    {
      key: "count",
      header: "Count",
      sortable: true,
      sortValue: (a) => count(a),
      cell: (a) => fmtCount(count(a)),
    },
    {
      key: "labor",
      header: "Labor Gross",
      sortable: true,
      sortValue: (a) => labor(a),
      cell: (a) => fmtMoney(labor(a)),
    },
    {
      key: "parts",
      header: "Parts Gross",
      sortable: true,
      sortValue: (a) => parts(a),
      cell: (a) => fmtMoney(parts(a)),
    },
    {
      key: "total",
      header: "Total Gross",
      align: "right",
      sortable: true,
      sortValue: (a) => labor(a) + parts(a),
      cell: (a) => (
        <span className="font-semibold text-fg-strong">
          {fmtMoney(labor(a) + parts(a))}
        </span>
      ),
    },
  ];
}

type CommodityRow = {
  key: string;
  label: string;
  qty: number;
  partsGross: number;
  laborGross: number;
};

function commodityColumns(
  fmtCount: (n: number) => string,
  fmtMoney: (n: number) => string
): Column<CommodityRow>[] {
  return [
    {
      key: "label",
      header: "Commodity",
      sortable: true,
      sortValue: (r) => r.label,
      cell: (r) => <span className="font-medium text-fg-strong">{r.label}</span>,
      sticky: true,
    },
    {
      key: "qty",
      header: "Qty",
      sortable: true,
      sortValue: (r) => r.qty,
      cell: (r) => fmtCount(r.qty),
    },
    {
      key: "parts",
      header: "Parts Gross",
      sortable: true,
      sortValue: (r) => r.partsGross,
      cell: (r) => fmtMoney(r.partsGross),
    },
    {
      key: "labor",
      header: "Labor Gross",
      sortable: true,
      sortValue: (r) => r.laborGross,
      cell: (r) => fmtMoney(r.laborGross),
    },
    {
      key: "total",
      header: "Total Gross",
      align: "right",
      sortable: true,
      sortValue: (r) => r.partsGross + r.laborGross,
      cell: (r) => (
        <span className="font-semibold text-fg-strong">
          {fmtMoney(r.partsGross + r.laborGross)}
        </span>
      ),
    },
  ];
}

function closingColumns(
  fmtCount: (n: number) => string,
  fmtMoney: (n: number) => string,
  openAdvisor: (id: string, name: string) => void
): Column<AdvisorRow>[] {
  return [
    {
      key: "advisor",
      header: "Advisor",
      sortable: true,
      sortValue: (a) => a.advisorName,
      cell: (a) => (
        <button
          onClick={() => openAdvisor(a.advisorId, a.advisorName)}
          className="font-medium text-fg-strong hover:text-accent transition-colors text-left"
        >
          {a.advisorName}
        </button>
      ),
      sticky: true,
    },
    {
      key: "rec_count",
      header: "Rec Count",
      sortable: true,
      sortValue: (a) => a.metrics.recCount,
      cell: (a) => fmtCount(a.metrics.recCount),
    },
    {
      key: "rec_sold_count",
      header: "Rec Sold",
      sortable: true,
      sortValue: (a) => a.metrics.recSoldCount,
      cell: (a) => fmtCount(a.metrics.recSoldCount),
    },
    {
      key: "amounts",
      header: "Sold / Opp",
      cell: (a) => (
        <>
          {fmtMoney(a.metrics.recSoldAmount)}{" "}
          <span className="text-fg-subtle">
            / {fmtMoney(a.metrics.recAmount)}
          </span>
        </>
      ),
    },
    {
      key: "close_pct",
      header: "Close %",
      align: "right",
      sortable: true,
      sortValue: (a) => safeDiv(a.metrics.recSoldAmount, a.metrics.recAmount),
      cell: (a) => {
        const close = safeDiv(a.metrics.recSoldAmount, a.metrics.recAmount);
        return (
          <Badge tone={close >= 0.5 ? "success" : "neutral"}>
            {`${num2(close * 100)}%`}
          </Badge>
        );
      },
    },
  ];
}

function dailyColumns(
  openAdvisor: (id: string, name: string) => void
): Column<AdvisorRow>[] {
  return [
    {
      key: "advisor",
      header: "Advisor",
      sortable: true,
      sortValue: (a) => a.advisorName,
      cell: (a) => (
        <button
          onClick={() => openAdvisor(a.advisorId, a.advisorName)}
          className="font-medium text-fg-strong hover:text-accent transition-colors text-left"
        >
          {a.advisorName}
        </button>
      ),
      sticky: true,
    },
    {
      key: "labor",
      header: "Labor Gross",
      sortable: true,
      sortValue: (a) => a.metrics.dailyLaborGross,
      cell: (a) => money(a.metrics.dailyLaborGross),
    },
    {
      key: "parts",
      header: "Parts Gross",
      sortable: true,
      sortValue: (a) => a.metrics.dailyPartsGross,
      cell: (a) => money(a.metrics.dailyPartsGross),
    },
    {
      key: "total",
      header: "Total Daily Gross",
      align: "right",
      sortable: true,
      sortValue: (a) => a.metrics.dailyLaborGross + a.metrics.dailyPartsGross,
      cell: (a) => (
        <span className="font-semibold text-fg-strong">
          {money(a.metrics.dailyLaborGross + a.metrics.dailyPartsGross)}
        </span>
      ),
    },
  ];
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 min-w-0">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <Skeleton h={10} w={64} className="mb-3" />
            <Skeleton h={28} w={120} />
            <Skeleton h={10} w={48} className="mt-2" />
          </Card>
        ))}
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <Skeleton h={14} w={120} className="mb-4" />
            <Skeleton h={180} w="100%" />
          </Card>
        ))}
      </div>
    </div>
  );
}
