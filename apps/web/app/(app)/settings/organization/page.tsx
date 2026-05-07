import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";
import { Card, CardTitle, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OrganizationOverviewPage() {
  const tc = await resolveTenantContext();
  requireOrgAdmin(tc);

  const orgId = tc.org.organizationId;

  const [org, storeCount, memberCount, pendingInviteCount] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, createdAt: true },
    }),
    prisma.store.count({ where: { organizationId: orgId } }),
    prisma.membership.count({ where: { organizationId: orgId } }),
    prisma.invite.count({
      where: {
        organizationId: orgId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Stores" value={String(storeCount)} />
        <Stat label="Members" value={String(memberCount)} />
        <Stat
          label="Pending Invites"
          value={String(pendingInviteCount)}
          tone={pendingInviteCount > 0 ? "warning" : "neutral"}
        />
        <Stat label="Created" value={org.createdAt.toLocaleDateString()} />
      </div>

      <Card>
        <CardTitle>Organization Details</CardTitle>
        <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-3 text-sm">
          <dt className="text-fg-muted">Name</dt>
          <dd className="font-medium text-fg-strong">{org.name}</dd>
          <dt className="text-fg-muted">Slug</dt>
          <dd className="font-mono text-fg">{org.slug}</dd>
          <dt className="text-fg-muted">ID</dt>
          <dd className="font-mono text-xs text-fg-subtle">{org.id}</dd>
        </dl>
      </Card>
    </div>
  );
}
