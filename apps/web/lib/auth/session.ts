import { loadSessionUserOrNull } from "@/lib/server/tenant-context";
import type { SessionUser } from "@/lib/types/auth";

/**
 * Returns the SessionUser for the current request, or null if not signed in.
 *
 * IMPORTANT: This is a thin re-export over the cached primitive in
 * tenant-context.ts. Both this function and `resolveSessionUser` share the
 * same per-request cache, so the layout, page, admin guard, and API guard
 * can all call them freely without duplicating Supabase auth + Prisma work.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return loadSessionUserOrNull();
}

/**
 * Like getCurrentUser but throws if not authenticated.
 */
export async function requireCurrentUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}
