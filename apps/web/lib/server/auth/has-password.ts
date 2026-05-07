import { prisma } from "@/lib/db";

/**
 * Returns true if the Supabase auth user already has a password set.
 *
 * Users created via `auth.admin.inviteUserByEmail` start with a NULL
 * `encrypted_password` because the magic-link flow doesn't require one.
 * We use this as the gate for the onboarding "set your password" prompt:
 * if the column is non-null we assume the user has a password (either
 * set during onboarding or via the future "reset password" flow) and
 * skip the prompt.
 *
 * Reads `auth.users.encrypted_password` directly via the raw Postgres
 * connection (Prisma uses the `postgres` role which can read the auth
 * schema). Supabase's JS admin API doesn't expose the column.
 */
export async function userHasPassword(userId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ has_password: boolean }>>`
    SELECT encrypted_password IS NOT NULL AS has_password
    FROM auth.users
    WHERE id = ${userId}::uuid
  `;
  return rows[0]?.has_password ?? false;
}
