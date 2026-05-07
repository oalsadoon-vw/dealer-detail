"use server";

import { prisma } from "@/lib/db";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin, assertStoreBelongsToOrg } from "@/lib/server/authz";
import { isValidRole } from "@/lib/types/auth";
import type { MembershipRole } from "@/lib/types/auth";
import { audit } from "@/lib/server/audit";
import { sendInviteEmail } from "@/lib/server/email/send-invite-email";
import { revalidatePath } from "next/cache";

type ActionResult = { ok: true } | { ok: false; error: string };

type InviteActionResult =
  | { ok: true; inviteId: string; emailDelivery: "sent" | "magic_link" }
  | { ok: true; inviteId: string; emailDelivery: "failed"; emailWarning: string }
  | { ok: false; error: string };

async function resolveOrgAdminContext() {
  const tc = await resolveTenantContext();
  requireOrgAdmin(tc);
  return tc;
}

async function countOrgAdmins(orgId: string): Promise<number> {
  return prisma.membership.count({
    where: { organizationId: orgId, role: "org_admin" },
  });
}

export async function createInviteAction(
  formData: FormData
): Promise<InviteActionResult> {
  const tc = await resolveOrgAdminContext();
  const orgId = tc.org.organizationId;

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = (formData.get("role") as string)?.trim();
  const storeIdsRaw = formData.getAll("storeIds") as string[];
  const storeIds = storeIdsRaw.filter(Boolean);

  if (!email || !role) return { ok: false, error: "Email and role are required" };
  if (!isValidRole(role)) return { ok: false, error: `Invalid role: ${role}` };

  const existingInvite = await prisma.invite.findFirst({
    where: { organizationId: orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) return { ok: false, error: "A pending invite already exists for this email" };

  const existingMember = await prisma.membership.findFirst({
    where: { organizationId: orgId, profile: { email } },
  });
  if (existingMember)
    return { ok: false, error: "This user is already a member of this organization" };

  if (storeIds.length > 0) {
    for (const sid of storeIds) {
      await assertStoreBelongsToOrg(sid, orgId);
    }
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const invite = await prisma.invite.create({
    data: {
      organizationId: orgId,
      email,
      role: role as MembershipRole,
      storeIds,
      invitedById: tc.user.profileId,
      expiresAt,
    },
  });

  await audit({
    actorId: tc.user.profileId,
    actorEmail: tc.user.email,
    action: "invite.create",
    targetType: "invite",
    targetId: invite.id,
    organizationId: orgId,
    metadata: { email, role, storeIds },
  });

  // Best-effort email send. See note in admin.ts → createInviteForOrgAction.
  let emailResult;
  try {
    emailResult = await sendInviteEmail({
      email,
      organizationName: tc.org.organizationName,
      inviterName: tc.user.fullName ?? null,
      inviterEmail: tc.user.email,
      inviteId: invite.id,
    });
  } catch (e) {
    emailResult = {
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  revalidatePath("/settings/invites");

  if (!emailResult.ok) {
    return {
      ok: true,
      inviteId: invite.id,
      emailDelivery: "failed",
      emailWarning: emailResult.error,
    };
  }

  return {
    ok: true,
    inviteId: invite.id,
    emailDelivery: emailResult.method === "magic_link" ? "magic_link" : "sent",
  };
}

export async function updateMemberRoleAction(
  formData: FormData
): Promise<ActionResult> {
  const tc = await resolveOrgAdminContext();
  const orgId = tc.org.organizationId;

  const membershipId = (formData.get("membershipId") as string)?.trim();
  const newRole = (formData.get("role") as string)?.trim();

  if (!membershipId || !newRole) return { ok: false, error: "Membership and role are required" };
  if (!isValidRole(newRole)) return { ok: false, error: `Invalid role: ${newRole}` };

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: { organizationId: true, profileId: true, role: true },
  });

  if (!membership) return { ok: false, error: "Membership not found" };
  if (membership.organizationId !== orgId) return { ok: false, error: "Membership not in your organization" };
  if (membership.profileId === tc.user.profileId) return { ok: false, error: "You cannot change your own role" };

  if (membership.role === "org_admin" && newRole !== "org_admin") {
    const adminCount = await countOrgAdmins(orgId);
    if (adminCount <= 1) {
      return { ok: false, error: "Cannot demote the last organization admin. Promote another user first." };
    }
  }

  const oldRole = membership.role;

  await prisma.membership.update({
    where: { id: membershipId },
    data: { role: newRole },
  });

  await audit({
    actorId: tc.user.profileId,
    actorEmail: tc.user.email,
    action: "member.role_change",
    targetType: "membership",
    targetId: membershipId,
    organizationId: orgId,
    metadata: { profileId: membership.profileId, oldRole, newRole },
  });

  revalidatePath("/settings/members");
  return { ok: true };
}

export async function updateStoreAssignmentsAction(
  formData: FormData
): Promise<ActionResult> {
  const tc = await resolveOrgAdminContext();
  const orgId = tc.org.organizationId;

  const membershipId = (formData.get("membershipId") as string)?.trim();
  const storeIds = (formData.getAll("storeIds") as string[]).filter(Boolean);

  if (!membershipId) return { ok: false, error: "Membership is required" };

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: { organizationId: true, role: true, profileId: true },
  });

  if (!membership) return { ok: false, error: "Membership not found" };
  if (membership.organizationId !== orgId) return { ok: false, error: "Membership not in your organization" };

  for (const sid of storeIds) {
    await assertStoreBelongsToOrg(sid, orgId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.storeMembership.deleteMany({ where: { membershipId } });
    if (storeIds.length > 0) {
      await tx.storeMembership.createMany({
        data: storeIds.map((storeId) => ({ membershipId, storeId })),
        skipDuplicates: true,
      });
    }
  });

  await audit({
    actorId: tc.user.profileId,
    actorEmail: tc.user.email,
    action: "member.store_assignment",
    targetType: "membership",
    targetId: membershipId,
    organizationId: orgId,
    metadata: { profileId: membership.profileId, storeIds },
  });

  revalidatePath(`/settings/members/${membershipId}`);
  revalidatePath("/settings/members");
  return { ok: true };
}

export async function removeMemberAction(
  formData: FormData
): Promise<ActionResult> {
  const tc = await resolveOrgAdminContext();
  const orgId = tc.org.organizationId;

  const membershipId = (formData.get("membershipId") as string)?.trim();
  if (!membershipId) return { ok: false, error: "Membership is required" };

  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: { organizationId: true, profileId: true, role: true },
  });

  if (!membership) return { ok: false, error: "Membership not found" };
  if (membership.organizationId !== orgId) return { ok: false, error: "Membership not in your organization" };
  if (membership.profileId === tc.user.profileId) return { ok: false, error: "You cannot remove yourself" };

  if (membership.role === "org_admin") {
    const adminCount = await countOrgAdmins(orgId);
    if (adminCount <= 1) {
      return { ok: false, error: "Cannot remove the last organization admin. Promote another user first." };
    }
  }

  const removedEmail = await prisma.profile
    .findUnique({ where: { id: membership.profileId }, select: { email: true } })
    .then((p) => p?.email ?? "unknown");

  await prisma.membership.delete({ where: { id: membershipId } });

  await audit({
    actorId: tc.user.profileId,
    actorEmail: tc.user.email,
    action: "member.remove",
    targetType: "membership",
    targetId: membershipId,
    organizationId: orgId,
    metadata: { removedProfileId: membership.profileId, removedEmail, role: membership.role },
  });

  revalidatePath("/settings/members");
  return { ok: true };
}
