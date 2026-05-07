import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userHasPassword } from "@/lib/server/auth/has-password";
import SetPasswordForm from "./set-password-form";

/**
 * One-time onboarding step shown the first time a magic-link / invite
 * user lands in the app. Lets them set a password (so they can sign in
 * with email + password later) or skip and continue using magic links.
 *
 * Gating logic:
 *   - Not signed in              → /login
 *   - Already has a password     → next (default /dashboard)
 *   - Already chose to skip      → next (we set
 *     `user_metadata.onboarding_completed = true` after the user picks)
 *   - Otherwise                  → render the form
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/dashboard";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/onboarding/set-password?next=${next}`)}`);
  }

  const onboardingCompleted = !!user.user_metadata?.onboarding_completed;
  const hasPassword = onboardingCompleted ? true : await userHasPassword(user.id);

  if (hasPassword || onboardingCompleted) {
    redirect(next);
  }

  return <SetPasswordForm email={user.email ?? ""} next={next} />;
}
