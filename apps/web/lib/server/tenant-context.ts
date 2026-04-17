import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { resolveInvitesForUser } from "@/lib/auth/invite-resolution";
import type {
  SessionUser,
  OrgContext,
  MembershipRole,
  MembershipWithContext,
} from "@/lib/types/auth";
import { UnauthenticatedError, ForbiddenError } from "./errors";

const ORG_COOKIE = "dd_org_id";

/**
 * The fully-resolved tenant context for a single server-side request.
 * Built once per request, consumed by authz checks and data queries.
 */
export type TenantContext = {
  user: SessionUser;
  org: OrgContext;
};

/**
 * Resolves the complete tenant context for the current request.
 *
 * Pipeline:
 *   1. Validate Supabase JWT → get auth user
 *   2. Bootstrap profile (upsert) → resolve pending invites
 *   3. Build SessionUser (profile + platform admin + memberships)
 *   4. Resolve active org from cookie → validate membership → accessible stores
 *
 * Throws UnauthenticatedError if no valid session.
 * Throws ForbiddenError if user has no org access (and is not a platform admin).
 */
export async function resolveTenantContext(): Promise<TenantContext> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new UnauthenticatedError();

  const sessionUser = await bootstrapAndBuildUser(authUser);

  if (sessionUser.memberships.length === 0 && !sessionUser.isPlatformAdmin) {
    throw new ForbiddenError("No organization membership");
  }

  const org = await resolveOrgContext(sessionUser);

  if (!org) {
    throw new ForbiddenError("No organization context available");
  }

  return { user: sessionUser, org };
}

/**
 * Resolves a platform admin context. Throws if the user is not a platform
 * admin. Does NOT require org context — platform admins operate cross-org.
 */
export async function resolveAdminContext(): Promise<SessionUser> {
  const user = await resolveSessionUser();
  if (!user.isPlatformAdmin) {
    throw new ForbiddenError("Platform admin access required");
  }
  return user;
}

/**
 * Lightweight variant: resolves only the SessionUser (no org context).
 * Useful for routes like set-org where the org is being *chosen*.
 */
export async function resolveSessionUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) throw new UnauthenticatedError();

  return bootstrapAndBuildUser(authUser);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function bootstrapAndBuildUser(authUser: {
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

  await resolveInvitesForUser(profile.id, email);

  const fullProfile = await prisma.profile.findUniqueOrThrow({
    where: { id: profile.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      platformAdmin: { select: { id: true } },
    },
  });

  const memberships = await loadMemberships(profile.id);

  return {
    profileId: fullProfile.id,
    email: fullProfile.email,
    fullName: fullProfile.fullName,
    isPlatformAdmin: !!fullProfile.platformAdmin,
    memberships,
  };
}

async function loadMemberships(
  profileId: string
): Promise<MembershipWithContext[]> {
  const rows = await prisma.membership.findMany({
    where: { profileId },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      storeMemberships: { select: { storeId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((m) => ({
    id: m.id,
    organizationId: m.organizationId,
    organization: m.organization,
    role: m.role as MembershipRole,
    storeIds: m.storeMemberships.map((sm) => sm.storeId),
  }));
}

async function resolveOrgContext(
  sessionUser: SessionUser
): Promise<OrgContext | null> {
  if (sessionUser.memberships.length === 0) return null;

  const cookieStore = await cookies();
  const preferredOrgId = cookieStore.get(ORG_COOKIE)?.value;

  let membership = preferredOrgId
    ? sessionUser.memberships.find((m) => m.organizationId === preferredOrgId)
    : undefined;

  if (!membership) {
    membership = sessionUser.memberships[0];
  }

  const accessibleStoreIds = await resolveAccessibleStoreIds(
    sessionUser,
    membership
  );

  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    role: membership.role,
    membershipId: membership.id,
    accessibleStoreIds,
  };
}

async function resolveAccessibleStoreIds(
  sessionUser: SessionUser,
  membership: MembershipWithContext
): Promise<string[]> {
  if (sessionUser.isPlatformAdmin || membership.role === "org_admin") {
    const stores = await prisma.store.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    return stores.map((s) => s.id);
  }

  return membership.storeIds;
}
