"use client";

import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { BrandLockup, BRAND_NAME } from "@/components/BrandMark";

export default function PendingAccessClient({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 flex">
      <PendingBackground />

      {/* Left branding — hidden on mobile */}
      <div className="relative hidden lg:flex lg:w-[480px] flex-col justify-between border-r border-zinc-800/60 bg-zinc-900/30 p-12 backdrop-blur-sm">
        <BrandLockup size="sm" variant="light" href="/" textClassName="text-white" />

        <div className="space-y-6">
          <p className="text-lg font-medium leading-relaxed text-zinc-300">
            You&apos;re almost there. Once your organization admin grants
            access, you&apos;ll have full visibility into your dealership&apos;s
            performance data.
          </p>
          <div className="text-sm text-zinc-500">
            Service Department Performance Intelligence
          </div>
        </div>

        <div className="text-xs text-zinc-700">
          &copy; {new Date().getFullYear()} {BRAND_NAME}
        </div>
      </div>

      {/* Right content */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden mb-2">
            <BrandLockup size="sm" variant="light" href="/" textClassName="text-white" />
          </div>

          <div className="space-y-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-800/60 bg-amber-900/30">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-amber-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white">Access pending</h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              You&apos;re signed in as{" "}
              <span className="font-medium text-zinc-200">{email}</span>, but
              you haven&apos;t been added to an organization yet.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 space-y-3 backdrop-blur-sm">
              <h2 className="text-sm font-semibold text-zinc-200">
                What happens next?
              </h2>
              <ol className="space-y-3 text-sm text-zinc-400">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-xs font-medium text-zinc-400">
                    1
                  </span>
                  <span>
                    Your organization administrator sends you an invite
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-xs font-medium text-zinc-400">
                    2
                  </span>
                  <span>
                    Access is granted automatically when the invite matches your
                    email
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-xs font-medium text-zinc-400">
                    3
                  </span>
                  <span>Refresh this page or sign in again to continue</span>
                </li>
              </ol>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.refresh()}
              className="flex-1 rounded-lg bg-white py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition-all hover:bg-zinc-100 hover:shadow-md active:scale-[0.98]"
            >
              Check again
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-zinc-800/60 px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-700/60 hover:text-zinc-300"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Subtle background for the pending screen — matches login palette. */
function PendingBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 30% 20%, #000 50%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 30% 20%, #000 50%, transparent 100%)",
        }}
      />
      <div className="absolute -top-40 left-[15%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.10),transparent)] blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.10),transparent)] blur-3xl" />
    </div>
  );
}
