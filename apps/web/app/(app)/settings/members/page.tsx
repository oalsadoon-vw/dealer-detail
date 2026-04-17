import Link from "next/link";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";
import { MemberRoleForm } from "./member-role-form";

export const dynamic = "force-dynamic";
import { RemoveMemberButton } from "./remove-member-button";

export default async function MembersPage() {
  const tc = await resolveTenantContext();
  requireOrgAdmin(tc);

  const members = await prisma.membership.findMany({
    where: { organizationId: tc.org.organizationId },
    include: {
      profile: { select: { id: true, email: true, fullName: true } },
      storeMemberships: {
        include: { store: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{members.length} members</p>
        <Link
          href="/settings/invites"
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm font-medium hover:bg-zinc-800 transition-colors"
        >
          Invite user
        </Link>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left">
            <tr>
              <th className="p-3 font-medium text-zinc-500">User</th>
              <th className="p-3 font-medium text-zinc-500">Role</th>
              <th className="p-3 font-medium text-zinc-500">Stores</th>
              <th className="p-3 font-medium text-zinc-500 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.profileId === tc.user.profileId;
              const storeNames = m.storeMemberships.map((sm) => sm.store.name);

              return (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="p-3">
                    <div className="font-medium">{m.profile.fullName ?? m.profile.email}</div>
                    <div className="text-xs text-zinc-500">{m.profile.email}</div>
                  </td>
                  <td className="p-3">
                    {isSelf ? (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
                        {m.role} (you)
                      </span>
                    ) : (
                      <MemberRoleForm membershipId={m.id} currentRole={m.role} />
                    )}
                  </td>
                  <td className="p-3">
                    {m.role === "org_admin" ? (
                      <span className="text-xs text-zinc-400">All stores</span>
                    ) : storeNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {storeNames.map((name) => (
                          <span key={name} className="inline-flex rounded bg-zinc-100 px-2 py-0.5 text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">None assigned</span>
                    )}
                    {!isSelf && m.role !== "org_admin" && (
                      <Link
                        href={`/settings/members/${m.id}`}
                        className="mt-1 inline-block text-xs text-zinc-500 underline hover:text-zinc-700"
                      >
                        Manage stores
                      </Link>
                    )}
                  </td>
                  <td className="p-3">
                    {!isSelf && <RemoveMemberButton membershipId={m.id} name={m.profile.fullName ?? m.profile.email} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
