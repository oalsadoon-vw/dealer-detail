/**
 * Sends a real invite email through whatever SMTP is configured on the
 * Supabase project. Use this any time you change SMTP settings (provider
 * swap, domain change, template tweak) to confirm end-to-end delivery
 * before flipping a real customer-facing flow.
 *
 * What it does:
 *   1. Uses the service-role Supabase client.
 *   2. Calls auth.admin.inviteUserByEmail with the same `data` payload that
 *      our admin actions send (organization_name, invited_by, invite_id),
 *      so the template variables resolve identically.
 *   3. Prints the auth.users row that was created/updated for the recipient.
 *
 * Run with:
 *   npx tsx scripts/test-invite-email.ts oalsadoon@scvolkswagen.com
 *
 * Optional flags via env:
 *   ORG_NAME   — what {{ .Data.organization_name }} renders as
 *                (default: "DealerDetail Test")
 *   INVITER    — what {{ .Data.invited_by }} renders as
 *                (default: "smtp-smoke-test")
 *   REDIRECT   — base URL for the magic-link redirect
 *                (default: NEXT_PUBLIC_APP_URL or http://localhost:3000)
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error("Usage: npx tsx scripts/test-invite-email.ts <email>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env."
    );
    process.exit(1);
  }

  const orgName = process.env.ORG_NAME ?? "DealerDetail Test";
  const inviter = process.env.INVITER ?? "smtp-smoke-test";
  const baseUrl =
    process.env.REDIRECT ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  const redirectTo = `${baseUrl.replace(/\/+$/, "")}/auth/callback?next=/dashboard`;

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`→ Inviting ${recipient}`);
  console.log(`  redirectTo:        ${redirectTo}`);
  console.log(`  organization_name: ${orgName}`);
  console.log(`  invited_by:        ${inviter}`);
  console.log("");

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(
    recipient,
    {
      data: {
        invite_id: `smoke-test-${Date.now()}`,
        organization_name: orgName,
        invited_by: inviter,
      },
      redirectTo,
    }
  );

  if (error) {
    console.error("✗ Invite failed:", error.message);
    if ((error as { code?: string }).code) {
      console.error("  code:", (error as { code?: string }).code);
    }
    process.exit(1);
  }

  console.log("✓ Supabase Auth accepted the invite.");
  console.log("");
  console.log("auth.users row:");
  console.log(`  id:             ${data.user.id}`);
  console.log(`  email:          ${data.user.email}`);
  console.log(`  invited_at:     ${data.user.invited_at ?? "—"}`);
  console.log(`  confirmed_at:   ${data.user.confirmed_at ?? "—"}`);
  console.log("");
  console.log("Now check:");
  console.log("  1. Inbox for a message from noreply@<your-sender-domain>.");
  console.log("  2. Supabase Dashboard → Logs → Auth Logs for `mail.send`.");
  console.log("     mail_from should be your custom sender, not");
  console.log("     noreply@mail.app.supabase.io.");
  console.log("  3. If you don't see it, also check spam and the");
  console.log("     SMTP provider's dashboard for delivery status.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
