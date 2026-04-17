"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export default function PendingAccessClient({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Left branding — hidden on mobile */}
      <div className="hidden lg:flex lg:w-[480px] flex-col justify-between border-r border-zinc-800/60 bg-zinc-900/20 p-12">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-white text-zinc-950 grid place-items-center font-bold">
            D
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-white">
            DealerDetail
          </span>
        </Link>

        <div className="space-y-6">
          <p className="text-lg font-medium leading-relaxed text-zinc-300">
            You&apos;re almost there. Once your organization admin grants access,
            you&apos;ll have full visibility into your dealership&apos;s
            performance data.
          </p>
          <div className="text-sm text-zinc-500">
            Dealership Performance Intelligence
          </div>
        </div>

        <div className="text-xs text-zinc-700">
          &copy; {new Date().getFullYear()} DealerDetail
        </div>
      </div>

      {/* Right content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-md space-y-8">
          <Link href="/" className="lg:hidden inline-flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-lg bg-white text-zinc-950 grid place-items-center font-bold text-sm">
              D
            </div>
            <span className="font-semibold text-sm text-white">
              DealerDetail
            </span>
          </Link>

          <div className="space-y-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-yellow-800/60 bg-yellow-900/30">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 space-y-3">
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
                  <span>
                    Refresh this page or sign in again to continue
                  </span>
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
