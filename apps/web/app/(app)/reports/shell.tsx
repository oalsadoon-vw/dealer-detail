"use client";

import { createContext, Suspense, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SectionHeading, Skeleton } from "@/components/ui";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ExportProvider } from "@/components/reports/ExportProvider";
import { ExportMenu } from "@/components/reports/ExportMenu";
import { PrintHeader } from "@/components/reports/PrintHeader";
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
  { href: "/reports/financials", label: "Financials" },
  { href: "/reports/elr", label: "ELR" },
  { href: "/reports/fleet", label: "Fleet Rollup" },
];

/** Page title + export filename slug for a /reports/* pathname. */
export function reportPageMeta(pathname: string): { title: string; slug: string } {
  const found = PAGES.find((p) => (p.href === "/reports" ? pathname === "/reports" : pathname.startsWith(p.href)));
  if (!found) return { title: "Reports", slug: "reports" };
  const slug = found.href === "/reports" ? "overview" : found.href.slice("/reports/".length);
  return { title: found.label, slug };
}

function Inner({ stores, children }: { stores: StoreOpt[]; children: React.ReactNode }) {
  const f = useReportFilters(stores);
  const pathname = usePathname() ?? "/reports";
  const store = stores.find((s) => s.id === f.storeId);
  const brand = storeBrand(store?.abbreviation ?? null);
  const isFleet = pathname.startsWith("/reports/fleet");
  const isFinancials = pathname.startsWith("/reports/financials");

  return (
    <Ctx.Provider value={{ f, stores }}>
      <ExportProvider>
        <main className="fade-in-up space-y-5 pb-20 min-w-0">
          <div className="flex items-start justify-between gap-4 print-hide">
            <SectionHeading
              title={isFleet ? "Fleet Rollup" : (store?.name ?? "Reports")}
              description={isFinancials ? "Tekion financial statement — GL balances as posted, same source as the printed OEM statement." : "Live from the Tekion Open API — every number traces to a repair order."}
              size="page"
            />
            <div className="flex shrink-0 items-center gap-2">
              <ExportMenu />
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
          </div>

          <PrintHeader />

          <nav className="flex flex-wrap gap-1 border-b border-line print-hide">
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

          <div className="print-hide">
            <ReportFilterBar stores={isFleet ? [] : stores} f={f} />
          </div>
          {children}
        </main>
      </ExportProvider>
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
