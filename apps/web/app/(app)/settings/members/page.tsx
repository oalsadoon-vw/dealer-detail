import Link from "next/link";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";
import { Badge, LinkButton, SectionHeading } from "@/components/ui";
import { MemberRoleForm } from "./member-role-form";
import { RemoveMemberButton } from "./remove-member-button";

export const dynamic = "force-dynamic";

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
    <div className="space-y-6">
      <SectionHeading
        title="Members"
        description={`${members.length} ${
          members.length === 1 ? "member" : "members"
        } in this organization.`}
        action={
          <LinkButton variant="primary" href="/settings/invites">
            Invite user
          </LinkButton>
        }
      />

      <div className="rounded-lg border border-line bg-surface overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2/60 text-fg-subtle">
            <tr className="border-b border-line">
              <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                User
              </th>
              <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                Role
              </th>
              <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                Stores
              </th>
              <th className="w-20 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {members.map((m) => {
              const isSelf = m.profileId === tc.user.profileId;
              const storeNames = m.storeMemberships.map(
                (sm) => sm.store.name
              );

              return (
                <tr
                  key={m.id}
                  className="hover:bg-accent-soft/40 transition-colors"
                >
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-fg-strong">
                      {m.profile.fullName ?? m.profile.email}
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {m.profile.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {isSelf ? (
                      <Badge tone="accent">{m.role.replace(/_/g, " ")} (you)</Badge>
                    ) : (
                      <MemberRoleForm
                        membershipId={m.id}
                        currentRole={m.role}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {m.role === "org_admin" ? (
                      <span className="text-xs text-fg-subtle">All stores</span>
                    ) : storeNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {storeNames.map((name) => (
                          <Badge key={name} tone="neutral" size="md">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-fg-subtle">
                        None assigned
                      </span>
                    )}
                    {!isSelf && m.role !== "org_admin" && (
                      <Link
                        href={`/settings/members/${m.id}`}
                        className="mt-1.5 inline-block text-xs text-accent hover:text-accent-strong transition-colors"
                      >
                        Manage stores →
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {!isSelf && (
                      <RemoveMemberButton
                        membershipId={m.id}
                        name={m.profile.fullName ?? m.profile.email}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-12 text-center text-sm text-fg-subtle"
                >
                  No members yet — invite a user to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
