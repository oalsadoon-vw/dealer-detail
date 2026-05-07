import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. **Bypasses RLS and Auth — never expose this
 * to the browser.** Only safe to call from server-only modules (route
 * handlers, server actions, cron jobs).
 *
 * Used for things only the platform itself can do, e.g. sending invite
 * emails via `auth.admin.inviteUserByEmail` or generating sign-in magic
 * links via `auth.signInWithOtp`.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "getSupabaseAdmin: NEXT_PUBLIC_SUPABASE_URL is not set"
    );
  }
  if (!serviceKey) {
    throw new Error(
      "getSupabaseAdmin: SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "Copy the service_role key from Supabase Project Settings → API → " +
        "Project API keys, and add it to apps/web/.env. " +
        "NEVER commit it or expose it to the browser."
    );
  }

  cached = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}
