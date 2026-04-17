import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/server/tenant-context";
import { requirePlatformAdmin, assertMembershipInOrg } from "@/lib/server/authz";

/**
 * Lists organizations the current user can access.
 * Platform admins see all orgs.
 */
export async function listAccessibleOrganizations(tc: TenantContext) {
  if (tc.user.isPlatformAdmin) {
    return prisma.organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
  }

  const orgIds = tc.user.memberships.map((m) => m.organizationId);
  return prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Retrieves a single organization by ID.
 * Enforces that the caller has membership (or is platform admin).
 */
export async function getOrganization(tc: TenantContext, orgId: string) {
  assertMembershipInOrg(tc, orgId);

  return prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      settings: true,
      createdAt: true,
    },
  });
}

/**
 * Creates a new organization.
 * Platform admin only.
 */
export async function createOrganization(
  tc: TenantContext,
  data: { name: string; slug: string }
) {
  requirePlatformAdmin(tc);

  return prisma.organization.create({
    data: { name: data.name, slug: data.slug },
  });
}
