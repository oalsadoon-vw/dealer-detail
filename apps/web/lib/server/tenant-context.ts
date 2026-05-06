import { cache } from "react";
import { createHash } from "crypto";
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
import { perfStart } from "./perf";
import { cacheGet, cacheSet, cacheInvalidatePrefix } from "./cache";

/**
 * Cache TTL for the resolved SessionUser. Short enough that role/permission
 * changes propagate without an explicit invalidation, long enough to absorb
 * a burst of navigations + refresh in the same browser tab. Tunable via
 * DD_SESSION_TTL_MS env var.
 */
const SESSION_TTL_MS = Number(process.env.DD_SESSION_TTL_MS ?? 30_000);

/**
 * Computes a stable cache key from the Supabase auth-token cookie(s).
 * Same cookie value across requests = same authenticated user. We hash the
 * raw cookie text (not the JWT subject) so we never have to decode the JWT
 * just to find the cache key.
 *
 * Returns null when there's no auth cookie at all (anonymous request).
 */
async function getAuthCookieKey(): Promise<string | null> {
  const cookieStore = await cookies();
  const authCookies = cookieStore
    .getAll()
    .filter(
      (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
    );
  if (authCookies.length === 0) return null;
  const concat = authCookies
    .map((c) => `${c.name}=${c.value}`)
    .sort()
    .join("|");
  return createHash("sha256").update(concat).digest("hex").slice(0, 24);
}

/**
 * Invalidates every cached SessionUser + OrgContext. Call from server
 * actions that change membership/role/platform-admin state or org
 * structure so users see the new state on the next request without
 * waiting for the TTL.
 */
export function invalidateAllSessionCaches(): void {
  cacheInvalidatePrefix("session:");
  cacheInvalidatePrefix("tenant-org:");
}

const ORG_COOKIE = "dd_org_id";

/**
 * The fully-resolved tenant context for a single server-side request.
 * Built once per request, consumed by authz checks and data queries.
 */
export type TenantContext = {
  user: SessionUser;
  org: OrgContext;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves the complete tenant context for the current request.
 * Throws UnauthenticatedError if no valid session.
 * Throws ForbiddenError if user has no org access (and is not a platform admin).
 *
 * Wrapped in React `cache()` so middleware-cleared layout + page + admin
 * guard + API guard all share a single execution per request.
 */
export const resolveTenantContext = cache(
  async (): Promise<TenantContext> => {
    const t = perfStart("resolveTenantContext");
    try {
      const sessionUser = await resolveSessionUser();

      if (sessionUser.memberships.length === 0 && !sessionUser.isPlatformAdmin) {
        throw new ForbiddenError("No organization membership");
      }

      // Cache the full org context (including accessibleStoreIds) at the
      // process level. The org-admin path otherwise does a 2s store
      // findMany on EVERY request just to enumerate accessible stores.
      // Key includes the user + the org cookie so switching orgs blows
      // its own cache entry.
      const cookieStore = await cookies();
      const orgCookieValue = cookieStore.get(ORG_COOKIE)?.value ?? "default";
      const orgCacheKey = `tenant-org:${sessionUser.profileId}:${orgCookieValue}`;

      let org = cacheGet<OrgContext>(orgCacheKey);
      if (org) {
        const tHit = perfStart("orgContext cache HIT");
        tHit.end();
      } else {
        const resolved = await resolveOrgContext(sessionUser);
        if (!resolved) {
          throw new ForbiddenError("No organization context available");
        }
        org = resolved;
        cacheSet(orgCacheKey, org, SESSION_TTL_MS);
      }

      return { user: sessionUser, org };
    } finally {
      t.end();
    }
  }
);

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
 * Resolves the SessionUser, throwing if not authenticated.
 * Delegates to the shared cached primitive so it shares work with
 * `getCurrentUser` and `resolveTenantContext` within a single request.
 */
export async function resolveSessionUser(): Promise<SessionUser> {
  const user = await loadSessionUserOrNull();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/**
 * Returns the SessionUser for the current request, or null if not signed in.
 *
 * This is THE single source of truth for "who is logged in?" — every entry
 * point (layout, page, API guard, admin guard) funnels through this cached
 * function so the auth + bootstrap pipeline runs at most once per request.
 *
 * Pipeline:
 *   1. supabase.auth.getUser() — one network round-trip (cached for the
 *      remainder of the request)
 *   2. ONE Prisma query loading profile + platformAdmin + memberships +
 *      storeMemberships, in parallel with a cheap pending-invite count
 *   3. Only if there are pending invites do we run the heavier resolution
 *      path and re-load relations
 */
export const loadSessionUserOrNull = cache(
  async (): Promise<SessionUser | null> => {
    // Process-level cache hit: skip BOTH supabase.auth.getUser AND every
    // Prisma query for the bootstrap. Most page navigations hit here.
    const cookieKey = await getAuthCookieKey();
    if (cookieKey) {
      const cacheKey = `session:${cookieKey}`;
      const cached = cacheGet<SessionUser>(cacheKey);
      if (cached) {
        const t = perfStart("session cache HIT");
        t.end();
        return cached;
      }
    }

    const tAuth = perfStart("auth.getUser");
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    tAuth.end();

    if (!authUser) return null;

    const tBoot = perfStart("bootstrap");
    let result: SessionUser;
    try {
      result = await bootstrapAndBuildUser(authUser);
    } finally {
      tBoot.end();
    }

    if (cookieKey) {
      cacheSet(`session:${cookieKey}`, result, SESSION_TTL_MS);
    }
    return result;
  }
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Single Prisma query that loads everything needed to construct a
 * SessionUser. The previous implementation made 3 sequential queries
 * (findUnique → findUniqueOrThrow → membership.findMany); this collapses
 * them into one round-trip via nested includes.
 */
const FULL_PROFILE_INCLUDE = {
  platformAdmin: { select: { id: true } },
  memberships: {
    select: {
      id: true,
      organizationId: true,
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
      storeMemberships: { select: { storeId: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

type FullProfileSelect = {
  id: true;
  email: true;
  fullName: true;
} & typeof FULL_PROFILE_INCLUDE;

const FULL_PROFILE_SELECT: FullProfileSelect = {
  id: true,
  email: true,
  fullName: true,
  ...FULL_PROFILE_INCLUDE,
};

type FullProfileRow = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.profile.findUnique<{
        where: { id: string };
        select: FullProfileSelect;
      }>
    >
  >
>;

function buildSessionUserFromRow(row: FullProfileRow): SessionUser {
  return {
    profileId: row.id,
    email: row.email,
    fullName: row.fullName,
    isPlatformAdmin: !!row.platformAdmin,
    memberships: row.memberships.map((m) => ({
      id: m.id,
      organizationId: m.organizationId,
      organization: m.organization,
      role: m.role as MembershipRole,
      storeIds: m.storeMemberships.map((sm) => sm.storeId),
    })),
  };
}

async function bootstrapAndBuildUser(authUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<SessionUser> {
  const email = authUser.email ?? "";

  // Fast path: load the full profile graph and the pending-invite count in
  // parallel. For the steady state (existing user, no pending invites) this
  // resolves the entire SessionUser in TWO concurrent Prisma round-trips.
  const tParallel = perfStart("prisma.profile+invite.count (parallel)");
  const [profile, pendingInviteCount] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: authUser.id },
      select: FULL_PROFILE_SELECT,
    }),
    prisma.invite.count({
      where: {
        email: { equals: email, mode: "insensitive" },
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  tParallel.end(`invites=${pendingInviteCount}`);

  // First-time login: create the profile, then resolve any invites and
  // re-load the full graph (memberships may have just been created).
  if (!profile) {
    const tCreate = perfStart("prisma.profile.create");
    await prisma.profile.create({
      data: {
        id: authUser.id,
        email,
        fullName: (authUser.user_metadata?.full_name as string) ?? null,
        avatarUrl: (authUser.user_metadata?.avatar_url as string) ?? null,
      },
      select: { id: true },
    });
    tCreate.end();

    if (pendingInviteCount > 0) {
      const tInv = perfStart("invite.resolve (first-login)");
      await resolveInvitesForUser(authUser.id, email);
      tInv.end();
    }

    return loadFullProfileOrThrow(authUser.id);
  }

  // Existing profile + pending invites → resolve them and re-load the graph
  // because new memberships may have been created.
  if (pendingInviteCount > 0) {
    const tInv = perfStart("invite.resolve");
    await resolveInvitesForUser(profile.id, email);
    tInv.end();
    return loadFullProfileOrThrow(profile.id);
  }

  // Common path: no pending invites, no profile creation. Use the data we
  // already have from the parallel query.
  return buildSessionUserFromRow(profile);
}

async function loadFullProfileOrThrow(profileId: string): Promise<SessionUser> {
  const t = perfStart("prisma.profile.findUniqueOrThrow (post-invite reload)");
  const row = await prisma.profile.findUniqueOrThrow({
    where: { id: profileId },
    select: FULL_PROFILE_SELECT,
  });
  t.end();
  return buildSessionUserFromRow(row);
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
    const t = perfStart("prisma.store.findMany (orgAdmin scope)");
    const stores = await prisma.store.findMany({
      where: { organizationId: membership.organizationId },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    t.end(`stores=${stores.length}`);
    return stores.map((s) => s.id);
  }

  return membership.storeIds;
}
