import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  BrandLockup,
  BrandMark,
  BRAND_NAME,
} from "@/components/BrandMark";

const FEATURES = [
  {
    title: "Advisor Scorecards",
    description:
      "Menu sales, a-la-carte, commodity, and recommendation metrics per advisor per day — with automatic trend detection.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 13h8v8H3v-8zm10-10h8v18h-8V3zM3 3h8v8H3V3z"
        />
      </svg>
    ),
  },
  {
    title: "Multi-Store Visibility",
    description:
      "Roll up performance across your entire dealership group. Compare stores, spot outliers, and track progress over time.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 7l8-4 8 4v2H4V7zm2 4h3v8H6v-8zm5 0h2v8h-2v-8zm4 0h3v8h-3v-8zM4 21h16v-2H4v2z"
        />
      </svg>
    ),
  },
  {
    title: "Automated Ingestion",
    description:
      "Upload Tekion exports or connect your email. We parse, classify, and normalize every report automatically.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3l4 4h-3v7h-2V7H8l4-4zm-7 14h14v2H5v-2z"
        />
      </svg>
    ),
  },
  {
    title: "Team Access Controls",
    description:
      "Invite your team with role-based permissions. Org admins, store managers, and viewers each see exactly what they need.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
  },
];

const METRICS = [
  { value: "8+", label: "Report types parsed" },
  { value: "100%", label: "Automated classification" },
  { value: "Daily", label: "Granularity" },
  { value: "Multi-store", label: "Ready from day one" },
];

const STEPS = [
  {
    num: "01",
    title: "Send us your reports",
    desc: "Upload Tekion exports or forward them via email. Any report shape, any naming convention.",
  },
  {
    num: "02",
    title: "We classify and normalize",
    desc: "Rules-based parsing maps every row to a canonical advisor, store, and date — no manual cleanup.",
  },
  {
    num: "03",
    title: "Your team sees the truth",
    desc: "Per-advisor scorecards, per-store rollups, and trend lines — all governed by role-based access.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white antialiased">
      {/* ════════════════ Background system ════════════════ */}
      <BackgroundLayer />

      {/* ════════════════ Header ════════════════ */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandLockup
            size="sm"
            variant="light"
            href="/"
            textClassName="text-white"
          />
          <Link
            href="/login"
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-950 shadow-sm transition-all hover:bg-zinc-100 hover:shadow-md active:scale-[0.98] sm:px-4 sm:py-2"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ════════════════ Hero ════════════════ */}
      <section className="relative">
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-24 md:pb-28 md:pt-32">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur-sm sm:text-[13px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Built for Tekion-powered dealerships
          </div>

          <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl lg:text-[72px]">
            Service department performance,{" "}
            <span className="bg-gradient-to-br from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
              made visible.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400 sm:mt-8 sm:text-lg md:text-xl">
            {BRAND_NAME} ingests your Tekion data and surfaces the metrics that
            matter&nbsp;&mdash; per&nbsp;advisor, per&nbsp;store, per&nbsp;day.
            Know exactly where your fixed ops revenue comes from.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:mt-10 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href="/login"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-white/5 transition-all hover:bg-zinc-100 hover:shadow-xl hover:shadow-white/10 active:scale-[0.98] sm:w-auto sm:px-6"
            >
              Sign in to your account
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <span className="text-xs text-zinc-500 sm:text-sm">
              Invite-only &middot; Contact us for access
            </span>
          </div>

          {/* Floating preview card — visible at md+ */}
          <div className="relative mx-auto mt-16 hidden max-w-4xl md:mt-20 md:block">
            <PreviewCard />
          </div>

          {/* Mobile-only mini preview */}
          <div className="relative mx-auto mt-12 max-w-md md:hidden">
            <MiniPreview />
          </div>
        </div>
      </section>

      {/* ════════════════ Metrics strip ════════════════ */}
      <section className="relative border-y border-zinc-800/60 bg-zinc-900/30 backdrop-blur-sm">
        <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-y divide-zinc-800/40 sm:grid-cols-4 sm:divide-y-0">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="flex flex-col items-center justify-center px-4 py-7 sm:px-6 sm:py-8"
            >
              <div className="bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                {m.value}
              </div>
              <div className="mt-1 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 sm:text-xs">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════ How it works ════════════════ */}
      <section className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            How it works
          </span>
          <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            From raw exports to operator-ready insights
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-zinc-400 sm:text-base">
            Three steps. No data engineering required.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:gap-5 md:mt-16 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.num}
              className="group relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 backdrop-blur-sm transition-all hover:border-zinc-700/80 hover:bg-zinc-900/50 sm:p-7"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-700/60 to-transparent" />
              <div className="flex items-center gap-3">
                <div className="font-mono text-xs text-zinc-600">{s.num}</div>
                <div className="h-px flex-1 bg-zinc-800/60" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                  Step
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold tracking-tight sm:text-xl">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {s.desc}
              </p>

              {/* Connector line for md+ */}
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-4 top-1/2 hidden h-px w-8 -translate-y-1/2 bg-gradient-to-r from-zinc-700 to-transparent md:block"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════ Features grid ════════════════ */}
      <section className="relative border-t border-zinc-800/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              What you get
            </span>
            <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
              Everything your fixed ops team needs
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-zinc-400 sm:text-base">
              Purpose-built for the way fixed operations actually run — not
              another generic BI dashboard.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 sm:gap-5 md:mt-16">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 backdrop-blur-sm transition-all hover:border-zinc-700/80 hover:bg-zinc-900/50 sm:p-8"
              >
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl transition-opacity group-hover:opacity-100" />
                <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 transition-colors group-hover:border-zinc-700 group-hover:text-white">
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════ CTA ════════════════ */}
      <section className="relative border-t border-zinc-800/60">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(16,185,129,0.06),transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 md:py-24">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            Ready to see your numbers clearly?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-pretty text-sm text-zinc-400 sm:text-base">
            {BRAND_NAME} is currently available by invitation. If you&apos;re a
            dealership group looking for better fixed operations visibility,
            we&apos;d love to connect.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-white/5 transition-all hover:bg-zinc-100 hover:shadow-xl hover:shadow-white/10 active:scale-[0.98] sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════ Footer ════════════════ */}
      <footer className="relative border-t border-zinc-800/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark size="xs" variant="light" />
            <span className="text-sm font-medium text-zinc-400">
              {BRAND_NAME}
            </span>
          </div>
          <div className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} {BRAND_NAME}. All rights
            reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
 * Background system
 *   - Dotted grid (CSS), with radial mask fade
 *   - Soft glow blobs (radial gradients, blurred)
 *   - All non-interactive (pointer-events-none)
 * ═════════════════════════════════════════════════════ */
function BackgroundLayer() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 30%, #000 50%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 30%, #000 50%, transparent 100%)",
        }}
      />

      {/* Top aurora */}
      <div className="absolute -top-40 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(99,102,241,0.18),rgba(16,185,129,0.08)_45%,transparent_75%)] blur-3xl" />

      {/* Mid-left glow */}
      <div className="absolute left-[-15%] top-[35%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.12),transparent)] blur-3xl" />

      {/* Mid-right glow */}
      <div className="absolute right-[-15%] top-[55%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(168,85,247,0.10),transparent)] blur-3xl" />

      {/* Bottom subtle */}
      <div className="absolute bottom-[-10%] left-1/2 h-[420px] w-[800px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(99,102,241,0.08),transparent)] blur-3xl" />
    </div>
  );
}

/* ═════════════════════════════════════════════════════
 * Hero preview — desktop
 *   Mirrors the actual /dashboard layout: light theme,
 *   tabs strip, filter bar, 6 KPI cards, 3 multi-color
 *   trend charts. Decorative only (no real data).
 * ═════════════════════════════════════════════════════ */

const KPIS = [
  { label: "Open ROs", value: "47", sub: "+5 vs last period", subClass: "text-emerald-600" },
  { label: "Total Daily Gross", value: "$182K", sub: "+12.4%", subClass: "text-emerald-600" },
  { label: "Advisors Active", value: "6", sub: "All stores", subClass: "text-zinc-500" },
  { label: "Menu Sales %", value: "6.38%", sub: "3 Sold", subClass: "text-zinc-500" },
  { label: "Commodity %", value: "574%", sub: "270 Qty", subClass: "text-zinc-500" },
  { label: "Rec Closing %", value: "82%", sub: "+4 vs target", subClass: "text-emerald-600" },
];

const TRENDS = [
  {
    title: "Open ROs Trend",
    colorClass: "text-indigo-500",
    fillClass: "fill-indigo-500/15",
    data: [12, 15, 14, 18, 17, 20, 19, 22, 21, 24, 23, 26, 25, 28],
  },
  {
    title: "Gross Trend",
    colorClass: "text-emerald-500",
    fillClass: "fill-emerald-500/15",
    data: [42, 48, 45, 52, 58, 54, 62, 60, 68, 65, 74, 72, 78, 82],
  },
  {
    title: "Commodity Qty Trend",
    colorClass: "text-amber-500",
    fillClass: "fill-amber-500/15",
    data: [80, 95, 88, 110, 105, 130, 125, 145, 140, 160, 155, 170, 168, 185],
  },
];

function PreviewCard() {
  return (
    <>
      {/* Glow halo behind the card */}
      <div className="pointer-events-none absolute -inset-6 rounded-[28px] bg-gradient-to-b from-white/[0.07] via-indigo-500/[0.05] to-transparent blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/10">
        {/* Browser chrome */}
        <div className="flex items-center border-b border-zinc-200 bg-zinc-100/80 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          </div>
          <div className="mx-auto rounded-md bg-white px-3 py-1 font-mono text-[11px] text-zinc-500 ring-1 ring-zinc-200">
            fixedopsreports.app/dashboard
          </div>
        </div>

        {/* Two-pane body: thin dark sidebar + light dashboard content */}
        <div className="flex">
          {/* Mini sidebar (matches the real one's collapsed look) */}
          <div className="hidden shrink-0 flex-col items-center gap-2 border-r border-zinc-200 bg-zinc-950 py-3 sm:flex">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 ring-1 ring-zinc-800">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M5 19V12" /><path d="M12 19V8" /><path d="M19 19V14" />
              </svg>
            </div>
            <div className="my-1 h-px w-6 bg-zinc-800" />
            {[
              "M12 3l4 4h-3v7h-2V7H8l4-4zm-7 14h14v2H5v-2z", // upload
              "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z", // runs
              "M3 13h8v8H3v-8zm10-10h8v18h-8V3zM3 3h8v8H3V3z", // dashboard (active)
            ].map((d, i) => (
              <div
                key={i}
                className={`grid h-7 w-7 place-items-center rounded-md ${
                  i === 2
                    ? "bg-zinc-900 text-white ring-1 ring-zinc-800"
                    : "text-zinc-500"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d={d} />
                </svg>
              </div>
            ))}
          </div>

          {/* Main dashboard content */}
          <div className="flex-1 space-y-3.5 bg-zinc-50 p-4 text-left sm:p-5">
            {/* Heading + tabs */}
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-bold leading-tight text-zinc-900 sm:text-lg">
                  Dashboard
                </h3>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Performance metrics and advisor insights.
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-0.5 rounded-lg bg-white p-0.5 text-[10px] ring-1 ring-zinc-200 lg:flex">
                {["Full Picture", "Menu Sales", "A-La-Carte", "Daily"].map(
                  (t, i) => (
                    <span
                      key={t}
                      className={
                        i === 0
                          ? "rounded-md bg-zinc-900 px-2.5 py-1 font-medium text-white"
                          : "px-2 py-1 text-zinc-500"
                      }
                    >
                      {t}
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Filter bar */}
            <div className="grid grid-cols-12 gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <div className="col-span-5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                  Store
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1 ring-1 ring-zinc-100">
                  <span className="truncate text-[11px] font-medium text-zinc-900">
                    Stevens Creek Volkswagen
                  </span>
                  <svg viewBox="0 0 20 20" className="h-3 w-3 text-zinc-400" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="col-span-4">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                  Date Range
                </div>
                <div className="mt-1 rounded-md bg-zinc-50 px-2 py-1 ring-1 ring-zinc-100 text-[11px] font-medium text-zinc-900">
                  Apr 1 → Apr 28
                </div>
              </div>
              <div className="col-span-3 flex flex-col items-end justify-end">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                  Rollup
                </div>
                <div className="mt-1 flex rounded-md bg-zinc-100 p-0.5 text-[10px]">
                  <span className="rounded bg-zinc-900 px-2 py-0.5 font-medium text-white">
                    Sum
                  </span>
                  <span className="px-2 py-0.5 text-zinc-500">Avg/Day</span>
                </div>
              </div>
            </div>

            {/* KPI grid — 3 x 2 */}
            <div className="grid grid-cols-3 gap-2.5">
              {KPIS.map((k) => (
                <div
                  key={k.label}
                  className="rounded-xl bg-white p-3 ring-1 ring-zinc-200"
                >
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                    {k.label}
                  </div>
                  <div className="mt-1 text-lg font-bold leading-tight text-zinc-900">
                    {k.value}
                  </div>
                  <div className={`mt-0.5 text-[10px] font-medium ${k.subClass}`}>
                    {k.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Trend charts — 3 different colors */}
            <div className="grid grid-cols-3 gap-2.5">
              {TRENDS.map((t, i) => (
                <div
                  key={t.title}
                  className="rounded-xl bg-white p-3 ring-1 ring-zinc-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-semibold text-zinc-700">
                      {t.title}
                    </div>
                    <div className={`text-[10px] font-medium ${t.colorClass}`}>
                      ↑ {[14, 22, 18][i]}%
                    </div>
                  </div>
                  <div className="mt-2 h-12">
                    <TrendSparkline
                      data={t.data}
                      colorClass={t.colorClass}
                      fillClass={t.fillClass}
                      gradId={`grad-trend-${i}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═════════════════════════════════════════════════════
 * Hero preview — mobile mini
 *   Compact light-themed dashboard slice for phones.
 * ═════════════════════════════════════════════════════ */
function MiniPreview() {
  const miniKpis = [
    { label: "Open ROs", val: "47", colorClass: "text-indigo-600" },
    { label: "Gross", val: "$182K", colorClass: "text-emerald-600" },
    { label: "Menu %", val: "6.38%", colorClass: "text-amber-600" },
  ];

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-4 rounded-[24px] bg-gradient-to-b from-white/[0.07] via-indigo-500/[0.05] to-transparent blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/10">
        {/* Browser chrome */}
        <div className="flex items-center border-b border-zinc-200 bg-zinc-100/80 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-zinc-300" />
            <span className="h-2 w-2 rounded-full bg-zinc-300" />
            <span className="h-2 w-2 rounded-full bg-zinc-300" />
          </div>
          <div className="mx-auto rounded bg-white px-2 py-0.5 font-mono text-[9px] text-zinc-500 ring-1 ring-zinc-200">
            fixedopsreports.app
          </div>
        </div>

        <div className="space-y-3 bg-zinc-50 p-3 text-left">
          <div>
            <div className="text-sm font-bold text-zinc-900">Dashboard</div>
            <div className="text-[10px] text-zinc-500">
              Performance metrics
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {miniKpis.map((k) => (
              <div
                key={k.label}
                className="rounded-lg bg-white p-2 ring-1 ring-zinc-200"
              >
                <div className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">
                  {k.label}
                </div>
                <div className={`mt-0.5 text-sm font-bold ${k.colorClass}`}>
                  {k.val}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {TRENDS.map((t, i) => (
              <div
                key={t.title}
                className="rounded-lg bg-white p-2 ring-1 ring-zinc-200"
              >
                <div className="text-[8px] font-semibold text-zinc-700 truncate">
                  {t.title}
                </div>
                <div className="mt-1 h-7">
                  <TrendSparkline
                    data={t.data}
                    colorClass={t.colorClass}
                    fillClass={t.fillClass}
                    gradId={`grad-mini-${i}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
 * SVG sparkline — gradient area + smoothed line.
 *   Color is driven by `colorClass` via currentColor.
 * ═════════════════════════════════════════════════════ */
function TrendSparkline({
  data,
  colorClass,
  fillClass,
  gradId,
}: {
  data: number[];
  colorClass: string;
  fillClass: string;
  gradId: string;
}) {
  const w = 100;
  const h = 100;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 8 - ((v - min) / range) * (h - 16);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`h-full w-full ${colorClass}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} className={fillClass} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
