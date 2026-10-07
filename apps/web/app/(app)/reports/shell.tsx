"use client";

import { createContext, Suspense, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SectionHeading, Skeleton } from "@/components/ui";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { reportHref, useReportFilters, type ReportFilters, type StoreOpt } from "@/lib/client/report-filters";
import { storeBrand } from "@/lib/client/store-brand";

const Ctx = createContext<{ f: ReportFilters; stores: StoreOpt[] } | null>(null);
export function useReportsCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useReportsCtx outside ReportsShell");
  return c;
}

const PAGES = [
  { href: "/reports", label: "Overview" },
  { href: "/reports/advisors", label: "Advisor Performance" },
  { href: "/reports/menu", label: "Menu Sales" },
  { href: "/reports/opcodes", label: "Opcodes & Commodities" },
  { href: "/reports/ros", label: "RO List" },
  { href: "/reports/fleet", label: "Fleet Rollup" },
];

function Inner({ stores, children }: { stores: StoreOpt[]; children: React.ReactNode }) {
  const f = useReportFilters(stores);
  const pathname = usePathname() ?? "/reports";
  const store = stores.find((s) => s.id === f.storeId);
  const brand = storeBrand(store?.abbreviation ?? null);
  const isFleet = pathname.startsWith("/reports/fleet");

  return (
    <Ctx.Provider value={{ f, stores }}>
      <main className="fade-in-up space-y-5 pb-20 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading
            title={isFleet ? "Fleet Rollup" : (store?.name ?? "Reports")}
            description="Live from the Tekion Open API — every number traces to a repair order."
            size="page"
          />
          {!isFleet && store && (
            <div
              className="hidden sm:flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide"
              style={{ background: brand.bg, color: brand.fg, border: `1px solid ${brand.accent}` }}
              title={store.name}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: brand.accent }} />
              {brand.wordmark}
            </div>
          )}
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-line">
          {PAGES.map((p) => {
            const active = p.href === "/reports" ? pathname === "/reports" : pathname.startsWith(p.href);
            return (
              <Link
                key={p.href}
                href={reportHref(p.href, f)}
                className={
                  "px-3 py-2 text-sm -mb-px border-b-2 transition-colors " +
                  (active ? "border-accent text-fg-strong font-medium" : "border-transparent text-fg-muted hover:text-fg-strong")
                }
              >
                {p.label}
              </Link>
            );
          })}
        </nav>

        <ReportFilterBar stores={isFleet ? [] : stores} f={f} />
        {children}
      </main>
    </Ctx.Provider>
  );
}

export function ReportsShell({ stores, children }: { stores: StoreOpt[]; children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-24 w-full" /></div>}>
      <Inner stores={stores}>{children}</Inner>
    </Suspense>
  );
}
