import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPasswordForm from "./set-password-form";

/**
 * One-time onboarding step shown the first time a magic-link / invite
 * user lands in the app. Lets them set a password (so they can sign in
 * with email + password later) or skip and continue using magic links.
 *
 * Gating logic:
 *   - Not signed in                       → /login
 *   - `onboarding_completed` is truthy    → next (already handled)
 *   - Otherwise                           → render the form
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
  if (onboardingCompleted) {
    redirect(next);
  }

  return <SetPasswordForm email={user.email ?? ""} next={next} />;
}
