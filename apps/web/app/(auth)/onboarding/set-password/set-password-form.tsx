"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { BrandLockup, BRAND_NAME } from "@/components/BrandMark";

const MIN_PASSWORD_LENGTH = 8;

export default function SetPasswordForm({
  email,
  next,
}: {
  email: string;
  next: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<"set" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirm) {
      return "Passwords don't match.";
    }
    return null;
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setLoading("set");
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: { onboarding_completed: true },
    });
    if (err) {
      setError(err.message);
      setLoading(null);
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function handleSkip() {
    setError(null);
    setLoading("skip");
    const { error: err } = await supabase.auth.updateUser({
      data: { onboarding_completed: true },
    });
    if (err) {
      setError(err.message);
      setLoading(null);
      return;
    }

    router.push(next);
    router.refresh();
  }

  const submitting = loading !== null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 flex">
      <AuthBackground />

      {/* Left branding panel — hidden on mobile */}
      <div className="relative hidden lg:flex lg:w-[480px] flex-col justify-between border-r border-zinc-800/60 bg-zinc-900/30 p-12 backdrop-blur-sm">
        <BrandLockup
          size="sm"
          variant="light"
          href="/"
          textClassName="text-white"
        />

        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-zinc-200 leading-snug">
            One quick step
          </h2>
          <ul className="space-y-3 text-sm text-zinc-400">
            <li className="flex items-start gap-2.5">
              <CheckIcon />
              <span>
                Setting a password lets you sign in directly without waiting
                for an email.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckIcon />
              <span>
                Magic links keep working &mdash; use whichever you prefer on
                any given day.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckIcon />
              <span>
                You can set or change a password later from{" "}
                <span className="font-medium text-zinc-300">Settings</span>.
              </span>
            </li>
          </ul>
        </div>

        <div className="text-xs text-zinc-700">
          &copy; {new Date().getFullYear()} {BRAND_NAME}
        </div>
      </div>

      {/* Right form panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2">
            <div className="lg:hidden mb-4">
              <BrandLockup
                size="sm"
                variant="light"
                href="/"
                textClassName="text-white"
              />
            </div>
            <h1 className="text-2xl font-bold text-white">Set your password</h1>
            <p className="text-sm text-zinc-500">
              You&apos;re signed in as{" "}
              <span className="font-medium text-zinc-300">{email}</span>. Choose
              a password to enable email + password sign-in &mdash; or skip and
              keep using magic links.
            </p>
          </div>

          <form onSubmit={handleSetPassword} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                New password
              </span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3.5 py-2.5 pr-20 text-sm text-white placeholder:text-zinc-600 transition-colors focus:border-zinc-500 focus:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-300">
                Confirm password
              </span>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 transition-colors focus:border-zinc-500 focus:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                placeholder="Re-enter your password"
              />
            </label>

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-900/60 bg-red-950/30 px-3.5 py-3 text-sm text-red-300">
                <svg
                  viewBox="0 0 20 20"
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition-all hover:bg-zinc-100 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading === "set" ? "Saving…" : "Set password & continue"}
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
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="w-full rounded-lg border border-zinc-800/60 bg-zinc-900/30 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-700/60 hover:text-zinc-300 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading === "skip"
              ? "One moment…"
              : "Skip for now — keep using magic links"}
          </button>

          <p className="text-center text-xs text-zinc-600 leading-relaxed">
            You can always set or change your password later from{" "}
            <span className="text-zinc-500">Settings &rarr; Account</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 01-1.06 0l-3.75-3.75a.75.75 0 111.06-1.06l3.22 3.22 6.97-6.97a.75.75 0 011.06 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* Subtle background for auth screens — matches login palette. */
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
