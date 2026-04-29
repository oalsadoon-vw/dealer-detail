"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { BrandLockup, BRAND_NAME } from "@/components/BrandMark";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const supabase = createClient();

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setMagicSent(true);
    setLoading(false);
  }

  if (magicSent) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-zinc-950 flex">
        <AuthBackground />
        <div className="relative flex flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-8">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-800/60 bg-emerald-900/30">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-white">Check your email</h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                We sent a sign-in link to{" "}
                <span className="font-medium text-zinc-200">{email}</span>.
                <br />
                Click the link in the email to continue.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-4">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Didn&apos;t receive it? Check your spam folder, or make sure
                you&apos;re using the email address your organization admin
                invited you with.
              </p>
            </div>

            <button
              className="mx-auto block text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={() => {
                setMagicSent(false);
                setEmail("");
              }}
            >
              &larr; Try a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 flex">
      <AuthBackground />

      {/* Left branding panel — hidden on mobile */}
      <div className="relative hidden lg:flex lg:w-[480px] flex-col justify-between border-r border-zinc-800/60 bg-zinc-900/30 p-12 backdrop-blur-sm">
        <BrandLockup size="sm" variant="light" href="/" textClassName="text-white" />

        <div className="space-y-6">
          <blockquote className="text-lg font-medium leading-relaxed text-zinc-300">
            &ldquo;Finally, we can see exactly where our fixed ops revenue comes
            from&nbsp;&mdash; per advisor, per store, every single day.&rdquo;
          </blockquote>
          <div className="text-sm text-zinc-500">
            Service Department Performance Intelligence
          </div>
        </div>

        <div className="text-xs text-zinc-700">
          &copy; {new Date().getFullYear()} {BRAND_NAME}
        </div>
      </div>

      {/* Right form panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <div className="lg:hidden mb-4">
              <BrandLockup size="sm" variant="light" href="/" textClassName="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="text-sm text-zinc-500">
              Sign in to access your dealership dashboard.
            </p>
          </div>

          <form
            onSubmit={
              mode === "password" ? handlePasswordLogin : handleMagicLink
            }
            className="space-y-4"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 transition-colors focus:border-zinc-500 focus:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                placeholder="you@dealership.com"
              />
            </label>

            {mode === "password" && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-300">
                  Password
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 transition-colors focus:border-zinc-500 focus:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                />
              </label>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-900/60 bg-red-950/30 px-3.5 py-3 text-sm text-red-300">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition-all hover:bg-zinc-100 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading
                ? "Signing in..."
                : mode === "password"
                  ? "Sign in"
                  : "Send magic link"}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800/60" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-950 px-3 text-xs text-zinc-600">or</span>
            </div>
          </div>

          <button
            className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/30 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-700/60 hover:text-zinc-300"
            onClick={() => setMode(mode === "password" ? "magic" : "password")}
          >
            {mode === "password"
              ? "Sign in with magic link"
              : "Sign in with password"}
          </button>

          <p className="text-center text-xs text-zinc-600 leading-relaxed">
            Access is invite-only. Contact your organization
            administrator if you need an account.
          </p>
        </div>
      </div>
    </div>
  );
}

/* Subtle background for auth screens — matches landing palette. */
function AuthBackground() {
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
      <div className="absolute -top-40 left-[15%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.18),transparent)] blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(closest-side,rgba(16,185,129,0.10),transparent)] blur-3xl" />
    </div>
  );
}
