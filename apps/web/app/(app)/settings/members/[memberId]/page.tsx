import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import { StoreAssignmentForm } from "./store-assignment-form";

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
      <Link href="/settings/members" className="text-xs text-zinc-500 hover:text-zinc-700">
        &larr; Back to members
      </Link>

      <div className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="font-medium">{membership.profile.fullName ?? membership.profile.email}</h2>
        <dl className="grid grid-cols-[100px_1fr] gap-y-1 text-sm">
          <dt className="text-zinc-500">Email</dt>
          <dd>{membership.profile.email}</dd>
          <dt className="text-zinc-500">Role</dt>
          <dd>
            <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium">
              {membership.role}
            </span>
          </dd>
        </dl>
      </div>

      {membership.role === "org_admin" ? (
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-zinc-500">
            Organization admins have access to all stores automatically.
            Store assignments do not apply.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div>
            <h3 className="font-medium">Store Access</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Select which stores this user can access. Unchecking all stores
              will remove their access to store-level data.
            </p>
          </div>
          <StoreAssignmentForm
            membershipId={membership.id}
            stores={orgStores}
            assignedStoreIds={assignedStoreIds}
          />
        </div>
      )}
    </div>
  );
}
