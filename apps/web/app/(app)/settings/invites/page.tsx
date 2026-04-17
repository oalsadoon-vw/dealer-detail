import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { prisma } from "@/lib/db";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

function Badge({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "green" | "yellow" | "red";
}) {
  const colors = {
    default: "bg-zinc-100 text-zinc-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${colors[variant]}`}>
      {children}
    </span>
  );
}

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
      <div className="rounded-lg border bg-white p-4">
        <h2 className="font-medium mb-4">Invite a user</h2>
        <InviteForm stores={stores} />
      </div>

      <div>
        <h2 className="font-medium mb-3">Invite History ({invites.length})</h2>
        {invites.length > 0 ? (
          <div className="rounded-lg border bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-zinc-50 text-left">
                <tr>
                  <th className="p-3 font-medium text-zinc-500">Email</th>
                  <th className="p-3 font-medium text-zinc-500">Role</th>
                  <th className="p-3 font-medium text-zinc-500">Status</th>
                  <th className="p-3 font-medium text-zinc-500">Sent</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const isPending = !inv.acceptedAt && inv.expiresAt > new Date();
                  const isAccepted = !!inv.acceptedAt;
                  return (
                    <tr key={inv.id} className="border-b last:border-b-0">
                      <td className="p-3">{inv.email}</td>
                      <td className="p-3">
                        <Badge>{inv.role.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="p-3">
                        {isAccepted && <Badge variant="green">Accepted</Badge>}
                        {isPending && <Badge variant="yellow">Pending</Badge>}
                        {!isAccepted && !isPending && <Badge variant="red">Expired</Badge>}
                      </td>
                      <td className="p-3 text-zinc-500">
                        {inv.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-4 text-sm text-zinc-500">
            No invites sent yet.
          </div>
        )}
      </div>
    </div>
  );
}
