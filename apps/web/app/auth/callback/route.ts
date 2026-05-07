import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { userHasPassword } from "@/lib/server/auth/has-password";

/**
 * Handles the OAuth / magic-link callback from Supabase Auth.
 *
 * Pipeline:
 *   1. Exchange the `code` for a session (signs the user in).
 *   2. If the user has no password yet AND hasn't already opted out of
 *      onboarding, route them to /onboarding/set-password where they
 *      can set a password or skip. Either choice writes
 *      `user_metadata.onboarding_completed = true` so we don't ask
 *      again.
 *   3. Otherwise redirect straight to `next` (default /dashboard).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const onboardingCompleted = !!data.user.user_metadata?.onboarding_completed;
      const hasPassword = onboardingCompleted
        ? true
        : await userHasPassword(data.user.id);

      if (!hasPassword && !onboardingCompleted) {
        const onboardUrl = new URL("/onboarding/set-password", origin);
        onboardUrl.searchParams.set("next", next);
        return NextResponse.redirect(onboardUrl);
      }

      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", origin)
  );
}
