import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/server/tenant-context";
import type { MembershipRole } from "@/lib/types/auth";
import { requireOrgAdmin } from "@/lib/server/authz";
import { isValidRole } from "@/lib/types/auth";
import { ForbiddenError } from "@/lib/server/errors";

/**
 * Lists pending and recent invites for the current org.
 * Requires org_admin role.
 */
export async function listInvitesForOrg(tc: TenantContext) {
  requireOrgAdmin(tc);

  return prisma.invite.findMany({
    where: { organizationId: tc.org.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      storeIds: true,
      token: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      invitedBy: { select: { email: true, fullName: true } },
    },
  });
}

/**
 * Creates an invite for the current org.
 * Requires org_admin role.
 * Validates role and store IDs.
 */
export async function createInvite(
  tc: TenantContext,
  data: {
    email: string;
    role: string;
    storeIds?: string[];
    expiresInDays?: number;
  }
) {
  requireOrgAdmin(tc);

  if (!isValidRole(data.role)) {
    throw new ForbiddenError(`Invalid role: ${data.role}`);
  }

  if (data.storeIds && data.storeIds.length > 0) {
    const validStores = await prisma.store.findMany({
      where: {
        id: { in: data.storeIds },
        organizationId: tc.org.organizationId,
      },
      select: { id: true },
    });
    const validIds = new Set(validStores.map((s) => s.id));
    const invalid = data.storeIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new ForbiddenError(
        `Store IDs not in current organization: ${invalid.join(", ")}`
      );
    }
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays ?? 30));

  return prisma.invite.create({
    data: {
      organizationId: tc.org.organizationId,
      email: data.email.toLowerCase().trim(),
      role: data.role as MembershipRole,
      storeIds: data.storeIds ?? [],
      invitedById: tc.user.profileId,
      expiresAt,
    },
  });
}

/**
 * Lists members of the current org.
 * Requires org_admin role.
 */
export async function listOrgMembers(tc: TenantContext) {
  requireOrgAdmin(tc);

  return prisma.membership.findMany({
    where: { organizationId: tc.org.organizationId },
    include: {
      profile: { select: { id: true, email: true, fullName: true, avatarUrl: true } },
      storeMemberships: {
        include: { store: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}
