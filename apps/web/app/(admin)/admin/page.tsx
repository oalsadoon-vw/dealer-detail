import Link from "next/link";
import { prisma } from "@/lib/db";
import { BRAND_NAME } from "@/components/BrandMark";
import {
  Card,
  Stat,
  LinkButton,
  SectionHeading,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [orgCount, storeCount, profileCount, pendingInviteCount] =
    await Promise.all([
      prisma.organization.count(),
      prisma.store.count(),
      prisma.profile.count(),
      prisma.invite.count({
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

  return (
    <div className="space-y-8 fade-in-up min-w-0">
      <SectionHeading
        title="Platform Admin"
        description={`Internal management console for ${BRAND_NAME}.`}
        size="page"
        action={
          <div className="flex gap-2">
            <LinkButton href="/admin/organizations/new" variant="primary">
              Create Organization
            </LinkButton>
            <LinkButton href="/admin/organizations" variant="secondary">
              View Organizations
            </LinkButton>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Organizations" value={String(orgCount)} />
        <Stat label="Total Stores" value={String(storeCount)} />
        <Stat label="Registered Users" value={String(profileCount)} />
        <Stat
          label="Pending Invites"
          value={String(pendingInviteCount)}
          tone={pendingInviteCount > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-fg-strong">Quick links</h2>
        <p className="mt-1 text-xs text-fg-muted">
          Jump to common admin actions.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/admin/organizations"
            className="rounded-md border border-line bg-surface px-4 py-3 hover:bg-surface-2 transition-colors group"
          >
            <div className="text-sm font-medium text-fg-strong">
              Manage Organizations
            </div>
            <div className="mt-0.5 text-xs text-fg-muted">
              Browse, create, and manage all customer organizations.
            </div>
          </Link>
          <Link
            href="/admin/organizations/new"
            className="rounded-md border border-line bg-surface px-4 py-3 hover:bg-surface-2 transition-colors group"
          >
            <div className="text-sm font-medium text-fg-strong">
              Onboard New Customer
            </div>
            <div className="mt-0.5 text-xs text-fg-muted">
              Create an organization with optional email source.
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}
