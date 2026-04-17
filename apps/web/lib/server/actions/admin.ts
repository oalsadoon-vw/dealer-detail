"use server";

import { prisma } from "@/lib/db";
import { resolveAdminContext } from "@/lib/server/tenant-context";
import { isValidRole } from "@/lib/types/auth";
import { audit } from "@/lib/server/audit";
import { redirect } from "next/navigation";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createOrganizationAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const name = (formData.get("name") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim().toLowerCase();

  if (!name || !slug) return { ok: false, error: "Name and slug are required" };
  if (!/^[a-z0-9-]+$/.test(slug))
    return { ok: false, error: "Slug must be lowercase alphanumeric with hyphens only" };

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) return { ok: false, error: "An organization with this slug already exists" };

  const org = await prisma.organization.create({ data: { name, slug } });

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "org.create",
    targetType: "organization",
    targetId: org.id,
    metadata: { name, slug },
  });

  redirect(`/admin/organizations/${org.id}`);
}

export async function createStoreForOrgAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const orgId = (formData.get("orgId") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const abbreviation = (formData.get("abbreviation") as string)?.trim();
  const timezone = (formData.get("timezone") as string)?.trim();

  if (!orgId || !name) return { ok: false, error: "Organization and name are required" };

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Organization not found" };

  let store;
  try {
    store = await prisma.store.create({
      data: {
        organizationId: orgId,
        name,
        abbreviation: abbreviation ? abbreviation.toUpperCase() : null,
        timezone: timezone || null,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2002")
      return { ok: false, error: "A store with this abbreviation already exists" };
    return { ok: false, error: "Failed to create store" };
  }

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "store.create",
    targetType: "store",
    targetId: store.id,
    organizationId: orgId,
    metadata: { name, abbreviation: abbreviation?.toUpperCase() ?? null },
  });

  redirect(`/admin/organizations/${orgId}`);
}

export async function createInviteForOrgAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const orgId = (formData.get("orgId") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = (formData.get("role") as string)?.trim();

  if (!orgId || !email || !role) return { ok: false, error: "All fields are required" };
  if (!isValidRole(role)) return { ok: false, error: `Invalid role: ${role}` };

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return { ok: false, error: "Organization not found" };

  const existingInvite = await prisma.invite.findFirst({
    where: { organizationId: orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existingInvite)
    return { ok: false, error: "A pending invite already exists for this email in this org" };

  const existingMember = await prisma.membership.findFirst({
    where: { organizationId: orgId, profile: { email } },
  });
  if (existingMember)
    return { ok: false, error: "This user is already a member of this organization" };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const invite = await prisma.invite.create({
    data: {
      organizationId: orgId,
      email,
      role,
      storeIds: [],
      invitedById: admin.profileId,
      expiresAt,
    },
  });

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "invite.create",
    targetType: "invite",
    targetId: invite.id,
    organizationId: orgId,
    metadata: { email, role },
  });

  redirect(`/admin/organizations/${orgId}`);
}
