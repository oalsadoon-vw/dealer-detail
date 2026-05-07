import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Result of attempting to send an invite email via Supabase Auth. */
export type SendInviteResult =
  | { ok: true; method: "invite" | "magic_link" }
  | { ok: false; error: string; code?: string };

/**
 * Determines the public app URL used for the magic-link redirect.
 * Honours `NEXT_PUBLIC_APP_URL` first (recommended for production), then
 * falls back to Vercel's auto-injected `VERCEL_URL`, then localhost.
 */
function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Sends an invite email through Supabase Auth.
 *
 * Two paths:
 *   1. Recipient has no Supabase auth user yet → `inviteUserByEmail` sends a
 *      branded "you've been invited" email with a confirmation link. Once
 *      they accept, they have a session and our `bootstrapProfile` /
 *      `resolveInvitesForUser` machinery turns the pending Invite row into
 *      a real Membership.
 *   2. Recipient already has an auth user (e.g. they previously signed up,
 *      or are part of another org) → `inviteUserByEmail` rejects with
 *      "User already registered". We fall back to `signInWithOtp` which
 *      emails them a one-click magic-link sign-in. Same end state — they
 *      land authenticated and the Invite resolves on first request.
 *
 * Either way, ALL email delivery happens through whichever SMTP provider
 * is wired up in your Supabase project (Project Settings → Auth → SMTP
 * Settings). On a fresh project that's the default Supabase mailer with
 * its low rate limits — fine for a handful of invites; configure a real
 * SMTP (Resend / SendGrid / SES) in the dashboard before scaling.
 */
export async function sendInviteEmail(opts: {
  email: string;
  organizationName: string;
  inviterName?: string | null;
  inviterEmail: string;
  inviteId: string;
}): Promise<SendInviteResult> {
  const supabase = getSupabaseAdmin();

  // After the user clicks the email link, Supabase signs them in and then
  // redirects here. /auth/callback exchanges the code for a session and
  // forwards to `next` — first-load there will trigger the invite
  // auto-resolve in resolveTenantContext.
  const redirectTo = `${getAppUrl()}/auth/callback?next=/dashboard`;

  const inviteAttempt = await supabase.auth.admin.inviteUserByEmail(
    opts.email,
    {
      data: {
        invite_id: opts.inviteId,
        organization_name: opts.organizationName,
        invited_by: opts.inviterName ?? opts.inviterEmail,
      },
      redirectTo,
    }
  );

  if (!inviteAttempt.error) {
    return { ok: true, method: "invite" };
  }

  // Fall back to OTP magic link for users that already have an auth account.
  const errMsg = inviteAttempt.error.message ?? "";
  const errCode = (inviteAttempt.error as { code?: string }).code;
  const looksLikeAlreadyRegistered =
    errCode === "email_exists" ||
    errCode === "user_already_exists" ||
    /already\s*(registered|exists)/i.test(errMsg);

  if (looksLikeAlreadyRegistered) {
    const otp = await supabase.auth.signInWithOtp({
      email: opts.email,
      options: {
        emailRedirectTo: redirectTo,
        // Don't auto-create a Profile here; the user already exists, and
        // bootstrapProfile will hydrate them on first request.
        shouldCreateUser: false,
      },
    });
    if (otp.error) {
      return {
        ok: false,
        error: `Recipient already has an account, but the magic-link sign-in failed: ${otp.error.message}`,
        code: (otp.error as { code?: string }).code,
      };
    }
    return { ok: true, method: "magic_link" };
  }

  return {
    ok: false,
    error: inviteAttempt.error.message,
    code: errCode,
  };
}
