import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 text-sm" : "h-9 w-9 text-base";
  return (
    <div
      className={`${dim} rounded-lg bg-white text-zinc-950 grid place-items-center font-bold tracking-tight`}
    >
      D
    </div>
  );
}

const FEATURES = [
  {
    title: "Advisor Scorecards",
    description:
      "Menu sales, a-la-carte, commodity, and recommendation metrics per advisor per day — with automatic trend detection.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8v8H3v-8zm10-10h8v18h-8V3zM3 3h8v8H3V3z" />
      </svg>
    ),
  },
  {
    title: "Multi-Store Visibility",
    description:
      "Roll up performance across your entire dealership group. Compare stores, spot outliers, and track progress over time.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7l8-4 8 4v2H4V7zm2 4h3v8H6v-8zm5 0h2v8h-2v-8zm4 0h3v8h-3v-8zM4 21h16v-2H4v2z" />
      </svg>
    ),
  },
  {
    title: "Automated Ingestion",
    description:
      "Upload Tekion exports or connect your email. DealerDetail parses, classifies, and normalizes your data automatically.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l4 4h-3v7h-2V7H8l4-4zm-7 14h14v2H5v-2z" />
      </svg>
    ),
  },
  {
    title: "Team Access Controls",
    description:
      "Invite your team with role-based permissions. Org admins, store managers, and viewers each see exactly what they need.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const METRICS = [
  { value: "8", label: "Report types parsed" },
  { value: "100%", label: "Automated classification" },
  { value: "Daily", label: "Granularity" },
  { value: "Multi-store", label: "Ready from day one" },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* ──────────── Header ──────────── */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size="sm" />
            <span className="font-semibold tracking-tight text-[15px]">
              DealerDetail
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 shadow-sm transition-all hover:bg-zinc-100 hover:shadow-md active:scale-[0.98]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* ──────────── Hero ──────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(120,119,198,0.12),transparent)]" />
        <div className="mx-auto max-w-4xl px-6 pb-24 pt-28 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs font-medium text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Built for Tekion-powered dealerships
          </div>

          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Service department performance,{" "}
            <span className="bg-gradient-to-r from-zinc-300 to-zinc-500 bg-clip-text text-transparent">
              made visible.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            DealerDetail ingests your Tekion data and surfaces the metrics that
            matter&nbsp;&mdash; per&nbsp;advisor, per&nbsp;store, per&nbsp;day.
            Know exactly where your fixed ops revenue comes from.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 shadow transition-all hover:bg-zinc-100 hover:shadow-lg active:scale-[0.98]"
            >
              Sign in to your account
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <span className="text-sm text-zinc-600">
              Invite-only &middot; Contact us for access
            </span>
          </div>
        </div>
      </section>

      {/* ──────────── Metrics bar ──────────── */}
      <section className="border-y border-zinc-800/60 bg-zinc-900/30">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px sm:grid-cols-4">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="flex flex-col items-center justify-center px-6 py-8"
            >
              <div className="text-2xl font-bold tracking-tight sm:text-3xl">
                {m.value}
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────── Features ──────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Everything your fixed ops team needs
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-zinc-400">
            From raw Tekion exports to actionable advisor dashboards in minutes,
            not days.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-8 transition-colors hover:border-zinc-700/60 hover:bg-zinc-900/50"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors group-hover:text-white">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────── CTA ──────────── */}
      <section className="border-t border-zinc-800/60">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to see your numbers clearly?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-zinc-400">
            DealerDetail is currently available by invitation. If you&apos;re a
            dealership group looking for better fixed operations visibility,
            we&apos;d love to connect.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 shadow transition-all hover:bg-zinc-100 hover:shadow-lg active:scale-[0.98]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────── Footer ──────────── */}
      <footer className="border-t border-zinc-800/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="text-sm font-medium text-zinc-400">
              DealerDetail
            </span>
          </div>
          <div className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} DealerDetail. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
