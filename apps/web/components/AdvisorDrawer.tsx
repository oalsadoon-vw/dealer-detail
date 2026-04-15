"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { BarChart } from "@/components/charts/BarChart";
import { PieChart } from "@/components/charts/PieChart";

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
  commodityMix: Array<{ commodityKey: string; qty: number; gross: number; laborGross: number }>;
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
  factory_chemicals: "Factory Chemicals"
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
    maximumFractionDigits: 2
  });
}

function pct(n: number, d: number) {
  if (d === 0) return "0.00%";
  return `${((n / d) * 100).toFixed(2)}%`;
}

function int0(x: number) {
  return Math.round(x || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
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
        commodityGross: 0
      }
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return filled;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${accent ?? "text-zinc-900"}`}>{value}</div>
    </div>
  );
}

export function AdvisorDrawer({
  advisorId,
  advisorName,
  storeId,
  startDate,
  endDate,
  onClose
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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/advisor?advisorId=${advisorId}&storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`)
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
      { label: "Menu Sales", value: menuTotalGross },
      { label: "A-La-Carte", value: alaTotalGross },
      { label: "Commodity", value: totalCommGross }
    ].filter((x) => x.value > 0);
  }, [m, menuTotalGross, alaTotalGross, totalCommGross]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <div
        className={`relative w-full max-w-2xl bg-white shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">{advisorName}</h2>
            <p className="mt-0.5 text-xs text-zinc-400 font-medium tracking-wide">
              {startDate} &rarr; {endDate}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
            </div>
          )}

          {error && (
            <div className="m-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-100">
              <strong>Error:</strong> {error}
            </div>
          )}

          {data && m && (
            <div className="space-y-6 p-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Open ROs" value={int0(m.openRos)} />
                <Stat label="Daily Gross" value={money(totalDailyGross)} accent="text-emerald-700" />
                <Stat label="Rec Close %" value={pct(m.recSoldAmount, m.recAmount)} accent={m.recAmount > 0 && m.recSoldAmount / m.recAmount >= 0.5 ? "text-emerald-700" : "text-zinc-900"} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Menu Count" value={int0(m.menuCount)} />
                <Stat label="Menu %" value={pct(m.menuCount, m.openRos)} />
                <Stat label="ALC Count" value={int0(m.alaCount)} />
                <Stat label="ALC %" value={pct(m.alaCount, m.openRos)} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Comm Qty" value={int0(totalCommQty)} />
                <Stat label="Comm %" value={pct(totalCommQty, m.openRos)} />
                <Stat label="Rec Sold" value={money(m.recSoldAmount)} />
                <Stat label="Rec Opp" value={money(m.recAmount)} />
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-100" />

              {/* Trend Charts */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 mb-3">Daily Trends</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <BarChart
                      title="Open ROs"
                      data={series.map((d) => ({ label: d.date.slice(5), value: d.openRos }))}
                      color="#6366f1"
                    />
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <BarChart
                      title="Daily Gross"
                      data={series.map((d) => ({ label: d.date.slice(5), value: d.dailyGross }))}
                      color="#10b981"
                      valueFormatter={money}
                    />
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <BarChart
                      title="Menu Count"
                      data={series.map((d) => ({ label: d.date.slice(5), value: d.menuCount }))}
                      color="#3b82f6"
                    />
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <BarChart
                      title="Commodity Qty"
                      data={series.map((d) => ({ label: d.date.slice(5), value: d.commodityQty }))}
                      color="#f59e0b"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-100" />

              {/* Commodity & Sales Breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <PieChart
                    title="Commodity Mix"
                    data={commMix.map((c) => ({
                      label: commLabel(c.commodityKey),
                      value: c.qty
                    }))}
                    valueFormatter={int0}
                  />
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <PieChart
                    title="Gross Breakdown"
                    data={salesBreakdown}
                    valueFormatter={money}
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-100" />

              {/* Gross Detail */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 mb-3">Gross Summary</h3>
                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50/80">
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Category</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Count</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Labor</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Parts</th>
                        <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      <tr className="hover:bg-zinc-50/50">
                        <td className="px-4 py-2.5 font-medium text-zinc-800">Menu Sales</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{int0(m.menuCount)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{money(m.menuLaborGross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{money(m.menuPartsGross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-zinc-800">{money(menuTotalGross)}</td>
                      </tr>
                      <tr className="hover:bg-zinc-50/50">
                        <td className="px-4 py-2.5 font-medium text-zinc-800">A-La-Carte</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{int0(m.alaCount)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{money(m.alaLaborGross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{money(m.alaPartsGross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-zinc-800">{money(alaTotalGross)}</td>
                      </tr>
                      <tr className="bg-zinc-50/30 font-semibold">
                        <td className="px-4 py-2.5 text-zinc-900">Total Daily Gross</td>
                        <td className="px-4 py-2.5 text-right" />
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{money(m.dailyLaborGross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{money(m.dailyPartsGross)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-900">{money(totalDailyGross)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Commodity Detail Table */}
              {commMix.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800 mb-3">Commodity Detail</h3>
                  <div className="overflow-hidden rounded-xl border border-zinc-200">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-50/80">
                          <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Commodity</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Qty</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Parts Gross</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Labor Gross</th>
                          <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {commMix.map((c) => (
                          <tr key={c.commodityKey} className="hover:bg-zinc-50/50">
                            <td className="px-4 py-2.5 font-medium text-zinc-800">{commLabel(c.commodityKey)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{int0(c.qty)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{money(c.gross)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{money(c.laborGross)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-zinc-800">{money(c.gross + c.laborGross)}</td>
                          </tr>
                        ))}
                        <tr className="bg-zinc-50/30 font-semibold">
                          <td className="px-4 py-2.5 text-zinc-900">Total</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{int0(totalCommQty)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{money(commMix.reduce((s, c) => s + c.gross, 0))}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-zinc-700">{money(commMix.reduce((s, c) => s + c.laborGross, 0))}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-zinc-900">{money(totalCommGross)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recommendations Detail */}
              <div>
                <h3 className="text-sm font-semibold text-zinc-800 mb-3">Recommendations</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Rec Count" value={int0(m.recCount)} />
                  <Stat label="Rec Sold" value={int0(m.recSoldCount)} />
                  <Stat label="Opportunity" value={money(m.recAmount)} />
                  <Stat label="Sold Amount" value={money(m.recSoldAmount)} />
                </div>
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-600">Closing Rate</span>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${
                      m.recAmount > 0 && m.recSoldAmount / m.recAmount >= 0.5
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200"
                    }`}
                  >
                    {pct(m.recSoldAmount, m.recAmount)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
