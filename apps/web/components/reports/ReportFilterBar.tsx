"use client";

import { Card, FormField, Select, Tabs, Button, Badge } from "@/components/ui";
import { DateRangePicker } from "@/components/DateRangePicker";
import {
  addDays, monthStartOf, prevMonthRange, todayPacific,
  type ReportFilters, type StoreOpt,
} from "@/lib/client/report-filters";

/**
 * Filter bar shared by every /reports page.
 *
 * The Opened/Closed toggle is the whole point: Tekion's RO list filtered by
 * date = ROs OPENED (created/checked-in) that day; the financial statement and
 * Closed-MTD scorecards = ROs CLOSED that day. Same ROs, different buckets.
 */
export function ReportFilterBar({ stores, f, lastSyncAt }: { stores: StoreOpt[]; f: ReportFilters; lastSyncAt?: string | null }) {
  const today = todayPacific();
  const presets = [
    { label: "Today", fn: () => ({ s: today, e: today }) },
    { label: "Yesterday", fn: () => ({ s: addDays(today, -1), e: addDays(today, -1) }) },
    { label: "MTD", fn: () => ({ s: monthStartOf(today), e: today }) },
    { label: "Last Month", fn: () => { const r = prevMonthRange(today); return { s: r.start, e: r.end }; } },
    { label: "7D", fn: () => ({ s: addDays(today, -6), e: today }) },
    { label: "30D", fn: () => ({ s: addDays(today, -29), e: today }) },
  ];
  return (
    <Card padded={false}>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-12">
        <FormField label="Store" className="xl:col-span-3">
          <Select value={f.storeId} onChange={(e) => f.set({ storeId: e.target.value })}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Date basis" className="xl:col-span-3">
          <Tabs
            tabs={[
              { id: "closed", label: "Closed" },
              { id: "opened", label: "Opened" },
            ]}
            value={f.basis}
            onChange={(v) => f.set({ basis: v as ReportFilters["basis"] })}
            variant="segmented"
          />
          <p className="mt-1 text-[11px] text-fg-subtle">
            {f.basis === "closed"
              ? "ROs by close date — matches Closed-MTD scorecards & financial statement."
              : "ROs by open/check-in date — matches the Tekion RO list filtered by created date."}
          </p>
        </FormField>

        <FormField label="Date range" className="sm:col-span-2 xl:col-span-6">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              startDate={f.startDate}
              endDate={f.endDate}
              onChange={({ startDate, endDate }) => f.set({ startDate, endDate })}
            />
            <div className="flex flex-wrap gap-1">
              {presets.map((p) => (
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
    </Card>
  );
}
