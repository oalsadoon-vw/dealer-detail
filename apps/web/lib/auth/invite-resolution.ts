import { prisma } from "@/lib/db";

type ResolvedInvite = {
  inviteId: string;
  organizationId: string;
  role: string;
  storeIds: string[];
};

/**
 * Finds pending (non-expired, non-accepted) invites for the given email
 * and converts each into a Membership (+ StoreMemberships if specified).
 *
 * Returns the count of newly accepted invites and any that were created.
 * Idempotent: an invite already accepted is skipped.
 */
export async function resolveInvitesForUser(
  profileId: string,
  email: string
): Promise<{ accepted: number; resolved: ResolvedInvite[] }> {
  const pendingInvites = await prisma.invite.findMany({
    where: {
      email: { equals: email, mode: "insensitive" },
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
  });

  if (pendingInvites.length === 0) {
    return { accepted: 0, resolved: [] };
  }

  const resolved: ResolvedInvite[] = [];

  for (const invite of pendingInvites) {
    const existingMembership = await prisma.membership.findUnique({
      where: {
        organizationId_profileId: {
          organizationId: invite.organizationId,
          profileId,
        },
      },
    });

    if (existingMembership) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      resolved.push({
        inviteId: invite.id,
        organizationId: invite.organizationId,
        role: existingMembership.role,
        storeIds: [],
      });
      continue;
    }

    const membership = await prisma.membership.create({
      data: {
        organizationId: invite.organizationId,
        profileId,
        role: invite.role,
      },
    });

    if (invite.storeIds.length > 0) {
      const validStores = await prisma.store.findMany({
        where: {
          id: { in: invite.storeIds },
          organizationId: invite.organizationId,
        },
        select: { id: true },
      });

      if (validStores.length > 0) {
        await prisma.storeMembership.createMany({
          data: validStores.map((s) => ({
            membershipId: membership.id,
            storeId: s.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    await prisma.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    resolved.push({
      inviteId: invite.id,
      organizationId: invite.organizationId,
      role: invite.role,
      storeIds: invite.storeIds,
    });
  }

  return { accepted: resolved.length, resolved };
}
