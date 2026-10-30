"use client";

import { Card, FormField, Select, Tabs, Button, Badge } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import { cn } from "@/components/ui/cn";
import {
  addDays, monthStartOf, prevMonthRange, todayPacific,
  activePreset, presets,
  type Basis, type ReportFilters, type StoreOpt,
} from "@/lib/client/report-filters";

const BASIS_EXPLAINER: Record<Basis, string> = {
  activity: "Every RO opened or closed in the range — the whole shop",
  closed: "By original close date — matches Tekion closed reports",
  opened: "By check-in date — matches the RO list",
};

/**
 * Filter bar shared by every /reports page.
 *
 * One responsive row — Store · Basis (Activity | Closed | Opened) · Date range
 * + presets — plus a second row of one-click view presets. The basis is the
 * crux (PLAN D2): "Activity" = everything that touched the shop in range,
 * "Closed" = Tekion close-date (financials), "Opened" = check-in date (RO list).
 */
export function ReportFilterBar({ stores, f, lastSyncAt }: { stores: StoreOpt[]; f: ReportFilters; lastSyncAt?: string | null }) {
  const today = todayPacific();
  const datePresets = [
    { label: "Today", fn: () => ({ s: today, e: today }) },
    { label: "Yesterday", fn: () => ({ s: addDays(today, -1), e: addDays(today, -1) }) },
    { label: "MTD", fn: () => ({ s: monthStartOf(today), e: today }) },
    { label: "Last Month", fn: () => { const r = prevMonthRange(today); return { s: r.start, e: r.end }; } },
    { label: "7D", fn: () => ({ s: addDays(today, -6), e: today }) },
    { label: "30D", fn: () => ({ s: addDays(today, -29), e: today }) },
    { label: "YTD", fn: () => ({ s: `${today.slice(0, 4)}-01-01`, e: today }) },
  ];

  const active = activePreset(f);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4 p-4">
        <FormField label="Store" className="w-full min-w-[180px] sm:w-56">
          <Select value={f.storeId} onChange={(e) => f.set({ storeId: e.target.value })}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Date basis" className="min-w-[260px]">
          <Tabs
            tabs={[
              { id: "activity", label: "Activity" },
              { id: "closed", label: "Closed" },
              { id: "opened", label: "Opened" },
            ]}
            value={f.basis}
            onChange={(v) => f.set({ basis: v as Basis })}
            variant="segmented"
          />
          <p className="mt-1 max-w-sm text-[11px] leading-snug text-fg-subtle">{BASIS_EXPLAINER[f.basis]}</p>
        </FormField>

        <FormField label="Date range" className="min-w-[300px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              startDate={f.startDate}
              endDate={f.endDate}
              onChange={({ startDate, endDate }) => f.set({ startDate, endDate })}
            />
            <div className="flex flex-wrap gap-1">
              {datePresets.map((p) => (
                <Button key={p.label} size="sm" variant="subtle" onClick={() => { const r = p.fn(); f.set({ startDate: r.s, endDate: r.e }); }}>
                  {p.label}
                </Button>
              ))}
            </div>
            {lastSyncAt !== undefined && (
              <Badge tone={lastSyncAt ? "info" : "warning"} size="sm" dot title="Last successful Tekion API sync for this store">
                {lastSyncAt ? `Synced ${new Date(lastSyncAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not synced"}
              </Badge>
            )}
          </div>
        </FormField>
      </div>

      {/* One-click view presets (PLAN B2 / D3) */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line-subtle px-4 py-2.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">View</span>
        {presets.map((p) => {
          const isActive = active?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => f.set(p.patch)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-colors duration-quick",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                isActive
                  ? "bg-accent text-accent-fg shadow-sm font-semibold"
                  : "border border-line font-medium text-fg-muted hover:border-line-strong hover:text-fg-strong"
              )}
            >
              {p.label}
            </button>
          );
        })}
        {!active && (
          <span className="text-xs text-fg-subtle">Custom</span>
        )}
      </div>
    </Card>
  );
}
