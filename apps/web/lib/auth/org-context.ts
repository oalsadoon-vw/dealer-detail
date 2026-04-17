import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import type {
  SessionUser,
  OrgContext,
  MembershipRole,
  StoreSummary,
} from "@/lib/types/auth";

const ORG_COOKIE = "dd_org_id";

/**
 * Resolves the active organization context for a request.
 *
 * Logic:
 * 1. Read the preferred org ID from the `dd_org_id` cookie.
 * 2. Validate that the user actually has a membership in that org.
 * 3. If cookie is missing or invalid, fall back to the user's first membership.
 * 4. Resolve which stores the user can access within that org.
 *
 * Returns null only if the user has zero memberships (should not happen
 * inside the protected app shell — layout.tsx gates on this).
 */
export async function getCurrentOrgContext(
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

/**
 * Returns the list of store IDs the user can access within an org.
 *
 * - org_admin: all stores in the org
 * - store_admin / manager / viewer: only stores listed in StoreMembership
 */
async function resolveAccessibleStoreIds(
  sessionUser: SessionUser,
  membership: SessionUser["memberships"][number]
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

/**
 * Returns full Store objects for the stores the user can access.
 */
export async function getAccessibleStores(
  sessionUser: SessionUser,
  orgId: string
): Promise<StoreSummary[]> {
  const membership = sessionUser.memberships.find(
    (m) => m.organizationId === orgId
  );
  if (!membership && !sessionUser.isPlatformAdmin) return [];

  if (sessionUser.isPlatformAdmin || membership?.role === "org_admin") {
    return prisma.store.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, abbreviation: true },
      orderBy: { name: "asc" },
    });
  }

  const storeIds = membership?.storeIds ?? [];
  if (storeIds.length === 0) return [];

  return prisma.store.findMany({
    where: { id: { in: storeIds }, organizationId: orgId },
    select: { id: true, name: true, abbreviation: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Persists the user's org selection to a cookie. Call from a server action
 * or API route handler.
 */
export async function setOrgContext(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Returns the effective role a user has in a specific organization.
 * Platform admins are treated as org_admin everywhere.
 */
export function getEffectiveRole(
  sessionUser: SessionUser,
  orgId: string
): MembershipRole | null {
  if (sessionUser.isPlatformAdmin) return "org_admin";
  const m = sessionUser.memberships.find((m) => m.organizationId === orgId);
  return m?.role ?? null;
}
