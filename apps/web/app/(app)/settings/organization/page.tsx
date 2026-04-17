import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";

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
      where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Stores", value: storeCount },
          { label: "Members", value: memberCount },
          { label: "Pending Invites", value: pendingInviteCount },
          { label: "Created", value: org.createdAt.toLocaleDateString() },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-white p-4">
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="mt-1 text-xs text-zinc-500">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="font-medium">Organization Details</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
          <dt className="text-zinc-500">Name</dt>
          <dd>{org.name}</dd>
          <dt className="text-zinc-500">Slug</dt>
          <dd className="font-mono text-zinc-600">{org.slug}</dd>
          <dt className="text-zinc-500">ID</dt>
          <dd className="font-mono text-xs text-zinc-400">{org.id}</dd>
        </dl>
      </div>
    </div>
  );
}
