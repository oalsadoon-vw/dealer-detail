"use client";

import { useEffect, useMemo, useState } from "react";
import { AreaChart } from "@/components/charts/AreaChart";
import { PieChart } from "@/components/charts/PieChart";
import {
  Drawer,
  Card,
  Stat,
  Badge,
  DataTable,
  type Column,
  EmptyState,
} from "@/components/ui";

type AdvisorData = {
  advisor: { id: string; name: string };
  dateRange: { startDate: string; endDate: string };
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
  dailySeries: Array<{
    date: string;
    openRos: number;
    menuCount: number;
    alaCount: number;
    dailyGross: number;
    commodityQty: number;
    commodityGross: number;
  }>;
  commodityMix: Array<{
    commodityKey: string;
    qty: number;
    gross: number;
    laborGross: number;
  }>;
};

const COMMODITY_LABELS: Record<string, string> = {
  air_filters: "Air Filters",
  cabin_filters: "Cabin Filters",
  batteries: "Batteries",
  tires: "Tires",
  brakes: "Brakes",
  alignments: "Alignments",
  wipers: "Wipers",
  belts: "Belts",
  fluids: "Fluids",
  factory_chemicals: "Factory Chemicals",
};

function commLabel(key: string) {
  return (
    COMMODITY_LABELS[key] ??
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function money(x: number) {
  return (x || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(n: number, d: number) {
  if (d === 0) return "0.00%";
  return `${((n / d) * 100).toFixed(2)}%`;
}

// Per-RO commodity attach rate. Same convention as the dashboard.
function ratio(n: number, d: number) {
  if (d === 0) return "—";
  return (n / d).toFixed(2);
}

function int0(x: number) {
  return Math.round(x || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function fillGaps(
  raw: AdvisorData["dailySeries"],
  startDate: string,
  endDate: string
): AdvisorData["dailySeries"] {
  const lookup = new Map(raw.map((d) => [d.date, d]));
  const filled: AdvisorData["dailySeries"] = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    filled.push(
      lookup.get(key) ?? {
        date: key,
        openRos: 0,
        menuCount: 0,
        alaCount: 0,
        dailyGross: 0,
        commodityQty: 0,
        commodityGross: 0,
      }
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return filled;
}

export function AdvisorDrawer({
  advisorId,
  advisorName,
  storeId,
  startDate,
  endDate,
  onClose,
}: {
  advisorId: string;
  advisorName: string;
  storeId: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<AdvisorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(
      `/api/advisor?advisorId=${advisorId}&storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`
    )
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `Failed (${r.status})`);
        return json as AdvisorData;
      })
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [advisorId, storeId, startDate, endDate]);

  const series = useMemo(() => {
    if (!data) return [];
    return fillGaps(data.dailySeries, startDate, endDate);
  }, [data, startDate, endDate]);

  const m = data?.metrics;
  const commMix = data?.commodityMix ?? [];
  const totalCommQty = commMix.reduce((s, c) => s + c.qty, 0);
  const totalCommGross = commMix.reduce((s, c) => s + c.gross + c.laborGross, 0);
  const menuTotalGross = (m?.menuLaborGross ?? 0) + (m?.menuPartsGross ?? 0);
  const alaTotalGross = (m?.alaLaborGross ?? 0) + (m?.alaPartsGross ?? 0);
  const totalDailyGross = (m?.dailyLaborGross ?? 0) + (m?.dailyPartsGross ?? 0);

  const salesBreakdown = useMemo(() => {
    if (!m) return [];
    return [
      { label: "Menu Sales", value: menuTotalGross, color: "#6366f1" },
      { label: "A-La-Carte", value: alaTotalGross, color: "#10b981" },
      { label: "Commodity", value: totalCommGross, color: "#f59e0b" },
    ].filter((x) => x.value > 0);
  }, [m, menuTotalGross, alaTotalGross, totalCommGross]);

  const closeRate = m && m.recAmount > 0 ? m.recSoldAmount / m.recAmount : 0;

  return (
    <Drawer
      open={true}
      onClose={onClose}
      size="xl"
      title={advisorName}
      description={`${startDate} → ${endDate}`}
    >
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      )}

      {error && (
        <div className="m-6 rounded-lg bg-danger-soft border border-danger/20 p-4 text-sm text-danger">
          <strong className="font-semibold">Error:</strong> {error}
        </div>
      )}

      {data && m && (
        <div className="space-y-6 p-5 sm:p-6 min-w-0">
          {/* Hero KPIs — 4 wide on sm+, 2 wide on tight */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Open ROs" value={int0(m.openRos)} />
            <Stat
              label="Daily Gross"
              value={money(totalDailyGross)}
              tone="success"
            />
            <Stat label="Comm / RO" value={ratio(totalCommQty, m.openRos)} />
            <Stat
              label="Rec Close %"
              value={pct(m.recSoldAmount, m.recAmount)}
              tone={closeRate >= 0.5 ? "success" : "neutral"}
            />
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Menu Count" value={int0(m.menuCount)} />
            <Stat label="Menu %" value={pct(m.menuCount, m.openRos)} />
            <Stat label="ALC Count" value={int0(m.alaCount)} />
            <Stat label="ALC %" value={pct(m.alaCount, m.openRos)} />
          </div>

          {/* Trend Charts */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg-strong">
              Daily Trends
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <AreaChart
                  title="Open ROs"
                  data={series.map((d) => ({
                    label: d.date.slice(5),
                    value: d.openRos,
                  }))}
                  color="rgb(var(--accent))"
                />
              </Card>
              <Card>
                <AreaChart
                  title="Daily Gross"
                  data={series.map((d) => ({
                    label: d.date.slice(5),
                    value: d.dailyGross,
                  }))}
                  color="rgb(var(--success))"
                  valueFormatter={money}
                />
              </Card>
              <Card>
                <AreaChart
                  title="Menu Count"
                  data={series.map((d) => ({
                    label: d.date.slice(5),
                    value: d.menuCount,
                  }))}
                  color="#3b82f6"
                />
              </Card>
              <Card>
                <AreaChart
                  title="Commodity Qty"
                  data={series.map((d) => ({
                    label: d.date.slice(5),
                    value: d.commodityQty,
                  }))}
                  color="rgb(var(--warning))"
                />
              </Card>
            </div>
          </section>

          {/* Mix + Breakdown */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <PieChart
                title="Commodity Mix"
                data={commMix.map((c) => ({
                  label: commLabel(c.commodityKey),
                  value: c.qty,
                }))}
                valueFormatter={int0}
              />
            </Card>
            <Card>
              <PieChart
                title="Gross Breakdown"
                data={salesBreakdown}
                valueFormatter={money}
              />
            </Card>
          </section>

          {/* Gross Summary table */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg-strong">
              Gross Summary
            </h3>
            <DataTable<GrossRow>
              columns={grossColumns()}
              keyField={(r) => r.label}
              rows={[
                {
                  label: "Menu Sales",
                  count: m.menuCount,
                  labor: m.menuLaborGross,
                  parts: m.menuPartsGross,
                  total: menuTotalGross,
                },
                {
                  label: "A-La-Carte",
                  count: m.alaCount,
                  labor: m.alaLaborGross,
                  parts: m.alaPartsGross,
                  total: alaTotalGross,
                },
                {
                  label: "Total Daily Gross",
                  count: null,
                  labor: m.dailyLaborGross,
                  parts: m.dailyPartsGross,
                  total: totalDailyGross,
                  emphasize: true,
                },
              ]}
              showDensityToggle={false}
            />
          </section>

          {/* Commodity Detail */}
          {commMix.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-fg-strong">
                Commodity Detail
              </h3>
              <DataTable<CommRow>
                columns={commodityColumns()}
                keyField={(r) => r.key}
                initialSort={{ key: "total", dir: "desc" }}
                rows={[
                  ...commMix.map((c) => ({
                    key: c.commodityKey,
                    label: commLabel(c.commodityKey),
                    qty: c.qty,
                    parts: c.gross,
                    labor: c.laborGross,
                    total: c.gross + c.laborGross,
                  })),
                ]}
              />
            </section>
          ) : (
            <Card>
              <EmptyState
                title="No commodity activity"
                description="No commodity items were sold in this date range."
              />
            </Card>
          )}

          {/* Recommendations */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg-strong">
              Recommendations
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Rec Count" value={int0(m.recCount)} />
              <Stat label="Rec Sold" value={int0(m.recSoldCount)} />
              <Stat label="Opportunity" value={money(m.recAmount)} />
              <Stat
                label="Sold Amount"
                value={money(m.recSoldAmount)}
                tone="success"
              />
            </div>
            <Card padded>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg-muted">
                  Closing Rate
                </span>
                <Badge tone={closeRate >= 0.5 ? "success" : "neutral"}>
                  {pct(m.recSoldAmount, m.recAmount)}
                </Badge>
              </div>
            </Card>
          </section>
        </div>
      )}
    </Drawer>
  );
}

type GrossRow = {
  label: string;
  count: number | null;
  labor: number;
  parts: number;
  total: number;
  emphasize?: boolean;
};

function grossColumns(): Column<GrossRow>[] {
  return [
    {
      key: "label",
      header: "Category",
      cell: (r) => (
        <span
          className={
            r.emphasize
              ? "font-semibold text-fg-strong"
              : "font-medium text-fg-strong"
          }
        >
          {r.label}
        </span>
      ),
    },
    {
      key: "count",
      header: "Count",
      align: "right",
      cell: (r) => (r.count == null ? "" : int0(r.count)),
    },
    {
      key: "labor",
      header: "Labor",
      align: "right",
      cell: (r) => money(r.labor),
    },
    {
      key: "parts",
      header: "Parts",
      align: "right",
      cell: (r) => money(r.parts),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (r) => (
        <span
          className={
            r.emphasize
              ? "font-semibold text-fg-strong"
              : "font-medium text-fg-strong"
          }
        >
          {money(r.total)}
        </span>
      ),
    },
  ];
}

type CommRow = {
  key: string;
  label: string;
  qty: number;
  parts: number;
  labor: number;
  total: number;
};

function commodityColumns(): Column<CommRow>[] {
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
      align: "right",
      sortable: true,
      sortValue: (r) => r.qty,
      cell: (r) => int0(r.qty),
    },
    {
      key: "parts",
      header: "Parts Gross",
      align: "right",
      sortable: true,
      sortValue: (r) => r.parts,
      cell: (r) => money(r.parts),
    },
    {
      key: "labor",
      header: "Labor Gross",
      align: "right",
      sortable: true,
      sortValue: (r) => r.labor,
      cell: (r) => money(r.labor),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortable: true,
      sortValue: (r) => r.total,
      cell: (r) => (
        <span className="font-semibold text-fg-strong">{money(r.total)}</span>
      ),
    },
  ];
}
