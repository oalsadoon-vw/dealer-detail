import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";
import { Card, CardTitle, CardDescription, Badge } from "@/components/ui";
import { StoreAssignmentForm } from "./store-assignment-form";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({
  params,
}: {
  params: { memberId: string };
}) {
  const tc = await resolveTenantContext();
  requireOrgAdmin(tc);
  const orgId = tc.org.organizationId;

  const membership = await prisma.membership.findUnique({
    where: { id: params.memberId },
    include: {
      profile: { select: { email: true, fullName: true } },
      storeMemberships: { select: { storeId: true } },
    },
  });

  if (!membership || membership.organizationId !== orgId) notFound();

  const orgStores = await prisma.store.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, abbreviation: true },
    orderBy: { name: "asc" },
  });

  const assignedStoreIds = membership.storeMemberships.map((sm) => sm.storeId);

  return (
    <div className="space-y-6 max-w-xl">
      <Link
        href="/settings/members"
        className="inline-flex items-center text-xs text-fg-muted hover:text-fg-strong transition-colors"
      >
        ← Back to members
      </Link>

      <Card>
        <CardTitle>
          {membership.profile.fullName ?? membership.profile.email}
        </CardTitle>
        <dl className="mt-3 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
          <dt className="text-fg-muted">Email</dt>
          <dd className="text-fg-strong">{membership.profile.email}</dd>
          <dt className="text-fg-muted">Role</dt>
          <dd>
            <Badge tone="accent">{membership.role.replace(/_/g, " ")}</Badge>
          </dd>
        </dl>
      </Card>

      {membership.role === "org_admin" ? (
        <Card>
          <p className="text-sm text-fg-muted">
            Organization admins have access to all stores automatically. Store
            assignments do not apply.
          </p>
        </Card>
      ) : (
        <Card>
          <CardTitle>Store Access</CardTitle>
          <CardDescription>
            Select which stores this user can access. Unchecking all stores
            will remove their access to store-level data.
          </CardDescription>
          <div className="mt-4">
            <StoreAssignmentForm
              membershipId={membership.id}
              stores={orgStores}
              assignedStoreIds={assignedStoreIds}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
