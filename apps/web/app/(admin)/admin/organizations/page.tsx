import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  LinkButton,
  SectionHeading,
  Badge,
  EmptyState,
  Card,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OrganizationsListPage() {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { stores: true, memberships: true, invites: true } },
    },
  });

  return (
    <div className="space-y-6 fade-in-up min-w-0">
      <SectionHeading
        title="Organizations"
        description={`${orgs.length} ${
          orgs.length === 1 ? "organization" : "organizations"
        } total.`}
        size="page"
        action={
          <LinkButton href="/admin/organizations/new" variant="primary">
            Create Organization
          </LinkButton>
        }
      />

      {orgs.length > 0 ? (
        <div className="rounded-lg border border-line bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-fg-subtle">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Stores
                </th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Members
                </th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Invites
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className="hover:bg-accent-soft/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/organizations/${org.id}`}
                      className="font-medium text-fg-strong hover:text-accent transition-colors"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">
                    {org.slug}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    <Badge tone="neutral">{org._count.stores}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    <Badge tone="neutral">{org._count.memberships}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {org._count.invites > 0 ? (
                      <Badge tone="warning">{org._count.invites}</Badge>
                    ) : (
                      <Badge tone="neutral">0</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {org.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <EmptyState
            title="No organizations yet"
            description="Onboard the first customer org to get started."
            action={
              <LinkButton href="/admin/organizations/new" variant="primary">
                Create one
              </LinkButton>
            }
          />
        </Card>
      )}
    </div>
  );
}
