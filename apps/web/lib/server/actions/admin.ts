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
  const senderEmailRaw = (formData.get("senderEmail") as string | null)?.trim() ?? "";
  const subjectPatternRaw = (formData.get("subjectPattern") as string | null)?.trim() ?? "";

  if (!name || !slug) return { ok: false, error: "Name and slug are required" };
  if (!/^[a-z0-9-]+$/.test(slug))
    return { ok: false, error: "Slug must be lowercase alphanumeric with hyphens only" };

  const senderEmail = senderEmailRaw.toLowerCase();
  if (senderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail))
    return { ok: false, error: "Sender email must be a valid email address" };

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) return { ok: false, error: "An organization with this slug already exists" };

  const subjectPattern = subjectPatternRaw || null;

  // Single transaction: org + (optional) initial email source. If anything
  // fails, neither row is created.
  const { org, emailSource } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name, slug } });
    let emailSource = null as null | { id: string; senderEmail: string };
    if (senderEmail) {
      emailSource = await tx.emailSource.create({
        data: {
          organizationId: org.id,
          senderEmail,
          subjectPattern,
          isActive: true,
        },
        select: { id: true, senderEmail: true },
      });
    }
    return { org, emailSource };
  });

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "org.create",
    targetType: "organization",
    targetId: org.id,
    metadata: { name, slug, initialEmailSource: emailSource?.senderEmail ?? null },
  });

  if (emailSource) {
    await audit({
      actorId: admin.profileId,
      actorEmail: admin.email,
      action: "email_source.create",
      targetType: "email_source",
      targetId: emailSource.id,
      organizationId: org.id,
      metadata: { senderEmail: emailSource.senderEmail, subjectPattern, scope: "org" },
    });
  }

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

/* ───────────────────────────────────────────────────────────────────────────
 * Org / store lifecycle: move and delete
 * ─────────────────────────────────────────────────────────────────────────── */

export async function moveStoreToOrgAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const storeId = (formData.get("storeId") as string)?.trim();
  const targetOrgId = (formData.get("targetOrgId") as string)?.trim();

  if (!storeId || !targetOrgId)
    return { ok: false, error: "Store and target organization are required" };

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!store) return { ok: false, error: "Store not found" };

  if (store.organizationId === targetOrgId)
    return { ok: false, error: "Store is already in this organization" };

  const targetOrg = await prisma.organization.findUnique({
    where: { id: targetOrgId },
    select: { id: true, name: true },
  });
  if (!targetOrg) return { ok: false, error: "Target organization not found" };

  const fromOrgId = store.organizationId;

  // Atomic move: reassign org, drop stale store-memberships, and migrate
  // any per-store EmailSource rows. New org's members can be re-assigned
  // to this store via the org-admin settings flow.
  //
  // EmailSource handling: a per-store source (storeId IS NOT NULL) needs to
  // either follow the store to the new org or, if the new org already has a
  // source with the same sender, be deleted (the new org's existing source
  // already covers this store via abbreviation matching).
  const perStoreSources = await prisma.emailSource.findMany({
    where: { storeId },
    select: { id: true, senderEmail: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.storeMembership.deleteMany({ where: { storeId } });

    for (const src of perStoreSources) {
      const collision = await tx.emailSource.findUnique({
        where: {
          organizationId_senderEmail: {
            organizationId: targetOrgId,
            senderEmail: src.senderEmail,
          },
        },
        select: { id: true },
      });
      if (collision) {
        await tx.emailSource.delete({ where: { id: src.id } });
      } else {
        await tx.emailSource.update({
          where: { id: src.id },
          data: { organizationId: targetOrgId },
        });
      }
    }

    await tx.store.update({
      where: { id: storeId },
      data: { organizationId: targetOrgId },
    });
  });

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "store.move",
    targetType: "store",
    targetId: storeId,
    organizationId: targetOrgId,
    metadata: {
      storeName: store.name,
      fromOrgId,
      toOrgId: targetOrgId,
      toOrgName: targetOrg.name,
    },
  });

  redirect(`/admin/organizations/${targetOrgId}`);
}

export async function deleteStoreAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const storeId = (formData.get("storeId") as string)?.trim();
  const confirm = (formData.get("confirm") as string)?.trim();

  if (!storeId) return { ok: false, error: "Store id is required" };

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      abbreviation: true,
      organizationId: true,
    },
  });
  if (!store) return { ok: false, error: "Store not found" };

  // Require the admin to type the store name verbatim. This is the user's
  // last line of defence against accidentally cascading away ingested files,
  // raw rows, advisors, daily metrics, commodity rows, ingestion runs, and
  // email sources for this store.
  if (confirm !== store.name) {
    return {
      ok: false,
      error: `Confirmation must match the store name exactly: "${store.name}"`,
    };
  }

  await prisma.store.delete({ where: { id: storeId } });

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "store.delete",
    targetType: "store",
    targetId: storeId,
    organizationId: store.organizationId,
    metadata: {
      storeName: store.name,
      abbreviation: store.abbreviation,
    },
  });

  redirect(`/admin/organizations/${store.organizationId}`);
}

export async function deleteOrganizationAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const orgId = (formData.get("orgId") as string)?.trim();
  const confirm = (formData.get("confirm") as string)?.trim().toLowerCase();

  if (!orgId) return { ok: false, error: "Organization id is required" };

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true },
  });
  if (!org) return { ok: false, error: "Organization not found" };

  if (confirm !== org.slug) {
    return {
      ok: false,
      error: `Confirmation must match the organization slug exactly: "${org.slug}"`,
    };
  }

  // Hard gate: refuse if any stores still belong to this org. Forces the
  // admin to explicitly move or delete each store first — never a surprise
  // mass-cascade.
  const storeCount = await prisma.store.count({
    where: { organizationId: orgId },
  });
  if (storeCount > 0) {
    return {
      ok: false,
      error: `Cannot delete: organization still has ${storeCount} store${
        storeCount === 1 ? "" : "s"
      }. Move or delete them first.`,
    };
  }

  // Memberships and Invites cascade automatically (declared in schema).
  await prisma.organization.delete({ where: { id: orgId } });

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "org.delete",
    targetType: "organization",
    targetId: orgId,
    metadata: { name: org.name, slug: org.slug },
  });

  redirect("/admin/organizations");
}

/* ───────────────────────────────────────────────────────────────────────────
 * Email source management (org-scoped)
 * ─────────────────────────────────────────────────────────────────────────── */

export async function addEmailSourceAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const orgId = (formData.get("orgId") as string)?.trim();
  const senderEmailRaw = (formData.get("senderEmail") as string)?.trim() ?? "";
  const subjectPatternRaw =
    (formData.get("subjectPattern") as string | null)?.trim() ?? "";

  if (!orgId || !senderEmailRaw)
    return { ok: false, error: "Organization and sender email are required" };

  const senderEmail = senderEmailRaw.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail))
    return { ok: false, error: "Sender email must be a valid email address" };

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) return { ok: false, error: "Organization not found" };

  const subjectPattern = subjectPatternRaw || null;

  let source;
  try {
    source = await prisma.emailSource.create({
      data: {
        organizationId: orgId,
        senderEmail,
        subjectPattern,
        isActive: true,
      },
      select: { id: true, senderEmail: true },
    });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002")
      return {
        ok: false,
        error: "This sender email is already configured for this organization",
      };
    return { ok: false, error: "Failed to add email source" };
  }

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "email_source.create",
    targetType: "email_source",
    targetId: source.id,
    organizationId: orgId,
    metadata: { senderEmail: source.senderEmail, subjectPattern, scope: "org" },
  });

  return { ok: true };
}

export async function removeEmailSourceAction(
  formData: FormData
): Promise<ActionResult> {
  const admin = await resolveAdminContext();

  const sourceId = (formData.get("sourceId") as string)?.trim();
  if (!sourceId) return { ok: false, error: "Email source id is required" };

  const source = await prisma.emailSource.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      organizationId: true,
      senderEmail: true,
      subjectPattern: true,
      storeId: true,
    },
  });
  if (!source) return { ok: false, error: "Email source not found" };

  await prisma.emailSource.delete({ where: { id: sourceId } });

  await audit({
    actorId: admin.profileId,
    actorEmail: admin.email,
    action: "email_source.delete",
    targetType: "email_source",
    targetId: source.id,
    organizationId: source.organizationId,
    metadata: {
      senderEmail: source.senderEmail,
      subjectPattern: source.subjectPattern,
      scope: source.storeId ? "store" : "org",
    },
  });

  return { ok: true };
}
