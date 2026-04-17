import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { resolveInvitesForUser } from "./invite-resolution";
import type { SessionUser, MembershipWithContext, MembershipRole } from "@/lib/types/auth";

/**
 * Ensures a Profile row exists for the Supabase auth user and resolves
 * any pending invites. Returns a fully-hydrated SessionUser.
 *
 * This is the single entry point for "login → authorized access".
 */
export async function bootstrapProfile(authUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<SessionUser> {
  const email = authUser.email ?? "";

  let profile = await prisma.profile.findUnique({
    where: { id: authUser.id },
    select: { id: true, email: true, fullName: true, avatarUrl: true },
  });

  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: authUser.id,
        email,
        fullName: (authUser.user_metadata?.full_name as string) ?? null,
        avatarUrl: (authUser.user_metadata?.avatar_url as string) ?? null,
      },
      select: { id: true, email: true, fullName: true, avatarUrl: true },
    });
  }

  // Resolve pending invites — may create new memberships
  await resolveInvitesForUser(profile.id, email);

  return buildSessionUser(profile.id);
}

/**
 * Returns the full SessionUser for an already-known profile ID.
 * Does NOT create profiles or resolve invites.
 */
export async function buildSessionUser(profileId: string): Promise<SessionUser> {
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: profileId },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformAdmin: { select: { id: true } },
    },
  });

  const memberships = await getCurrentMemberships(profileId);

  return {
    profileId: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    isPlatformAdmin: !!profile.platformAdmin,
    memberships,
  };
}

/**
 * High-level: get Supabase user → bootstrap profile → return SessionUser.
 * Returns null if the user is not authenticated.
 *
 * Call from Server Components, Route Handlers, and Server Actions.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return bootstrapProfile(user);
}

/**
 * Like getCurrentUser but throws if not authenticated.
 */
export async function requireCurrentUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

/**
 * Loads all memberships for a profile, including org details and
 * resolved store IDs from StoreMembership.
 */
export async function getCurrentMemberships(
  profileId: string
): Promise<MembershipWithContext[]> {
  const memberships = await prisma.membership.findMany({
    where: { profileId },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      storeMemberships: { select: { storeId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.id,
    organizationId: m.organizationId,
    organization: m.organization,
    role: m.role as MembershipRole,
    storeIds: m.storeMemberships.map((sm) => sm.storeId),
  }));
}
