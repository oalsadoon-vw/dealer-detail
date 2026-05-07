import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";
import {
  Card,
  CardTitle,
  CardDescription,
  Badge,
  SectionHeading,
  EmptyState,
} from "@/components/ui";
import { InviteForm } from "./invite-form";
import { CancelInviteButton } from "./cancel-invite-button";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const tc = await resolveTenantContext();
  requireOrgAdmin(tc);
  const orgId = tc.org.organizationId;

  const [invites, stores] = await Promise.all([
    prisma.invite.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        storeIds: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        invitedBy: { select: { email: true } },
      },
    }),
    prisma.store.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Invite a user</CardTitle>
        <CardDescription>
          Send an invite to grant a teammate access to this organization.
        </CardDescription>
        <div className="mt-4">
          <InviteForm stores={stores} />
        </div>
      </Card>

      <div className="space-y-3">
        <SectionHeading
          title="Invite History"
          description={`${invites.length} ${
            invites.length === 1 ? "invite" : "invites"
          } total.`}
        />

        {invites.length > 0 ? (
          <div className="rounded-lg border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2/60 text-fg-subtle">
                <tr className="border-b border-line">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                    Email
                  </th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                    Role
                  </th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                    Sent
                  </th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {invites.map((inv) => {
                  const isPending =
                    !inv.acceptedAt && inv.expiresAt > new Date();
                  const isAccepted = !!inv.acceptedAt;
                  const canCancel = !isAccepted;
                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-accent-soft/40 transition-colors"
                    >
                      <td className="px-4 py-3 text-fg-strong font-medium">
                        {inv.email}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">
                          {inv.role.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {isAccepted && <Badge tone="success">Accepted</Badge>}
                        {isPending && <Badge tone="warning">Pending</Badge>}
                        {!isAccepted && !isPending && (
                          <Badge tone="danger">Expired</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">
                        {inv.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canCancel ? (
                          <CancelInviteButton
                            inviteId={inv.id}
                            email={inv.email}
                          />
                        ) : (
                          <span className="text-xs text-fg-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No invites sent yet"
              description="Use the form above to invite a teammate."
            />
          </Card>
        )}
      </div>
    </div>
  );
}
