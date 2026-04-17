import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "green" | "yellow" | "red" }) {
  const colors = {
    default: "bg-zinc-800 text-zinc-300",
    green: "bg-emerald-900/60 text-emerald-300 border-emerald-800",
    yellow: "bg-yellow-900/60 text-yellow-300 border-yellow-800",
    red: "bg-red-900/60 text-red-300 border-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${colors[variant]}`}>
      {children}
    </span>
  );
}

export default async function OrgDetailPage({
  params,
}: {
  params: { orgId: string };
}) {
  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
  });
  if (!org) notFound();

  const [stores, members, invites] = await Promise.all([
    prisma.store.findMany({
      where: { organizationId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, abbreviation: true, timezone: true, createdAt: true },
    }),
    prisma.membership.findMany({
      where: { organizationId: org.id },
      include: {
        profile: { select: { email: true, fullName: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        invitedBy: { select: { email: true } },
      },
    }),
  ]);

  const hasOrgAdmin = members.some((m) => m.role === "org_admin");
  const pendingInvites = invites.filter((i) => !i.acceptedAt && i.expiresAt > new Date());
  const acceptedInvites = invites.filter((i) => i.acceptedAt);
  const expiredInvites = invites.filter((i) => !i.acceptedAt && i.expiresAt <= new Date());

  const onboardingComplete = hasOrgAdmin && stores.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin/organizations" className="text-xs text-zinc-500 hover:text-zinc-300">
          &larr; Organizations
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <span className="font-mono text-sm text-zinc-500">{org.slug}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {onboardingComplete ? (
            <Badge variant="green">Onboarded</Badge>
          ) : (
            <Badge variant="yellow">Setup Incomplete</Badge>
          )}
          {!hasOrgAdmin && <Badge variant="red">No Org Admin</Badge>}
          {stores.length === 0 && <Badge variant="red">No Stores</Badge>}
        </div>
      </div>

      {/* Onboarding checklist */}
      {!onboardingComplete && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/20 p-4 space-y-2">
          <h2 className="text-sm font-medium text-yellow-300">Onboarding Checklist</h2>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <span className={stores.length > 0 ? "text-emerald-400" : "text-zinc-600"}>{stores.length > 0 ? "✓" : "○"}</span>
              <span className={stores.length > 0 ? "text-zinc-300" : "text-zinc-400"}>
                Create at least one store
              </span>
              {stores.length === 0 && (
                <Link href={`/admin/organizations/${org.id}/stores/new`} className="text-xs text-yellow-400 underline ml-auto">
                  Create store
                </Link>
              )}
            </li>
            <li className="flex items-center gap-2">
              <span className={hasOrgAdmin ? "text-emerald-400" : "text-zinc-600"}>{hasOrgAdmin ? "✓" : "○"}</span>
              <span className={hasOrgAdmin ? "text-zinc-300" : "text-zinc-400"}>
                Invite an organization admin
              </span>
              {!hasOrgAdmin && (
                <Link href={`/admin/organizations/${org.id}/invites/new`} className="text-xs text-yellow-400 underline ml-auto">
                  Send invite
                </Link>
              )}
            </li>
          </ul>
        </div>
      )}

      {/* Stores section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Stores ({stores.length})</h2>
          <Link
            href={`/admin/organizations/${org.id}/stores/new`}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            Add Store
          </Link>
        </div>
        {stores.length > 0 ? (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/50">
                <tr>
                  <th className="text-left p-3 text-zinc-400 font-medium">Name</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Abbreviation</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Timezone</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-800/50 last:border-b-0">
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3 font-mono text-zinc-500">{s.abbreviation ?? "—"}</td>
                    <td className="p-3 text-zinc-500">{s.timezone ?? "—"}</td>
                    <td className="p-3 text-zinc-500">{s.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No stores yet.</p>
        )}
      </section>

      {/* Members section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members ({members.length})</h2>
        {members.length > 0 ? (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/50">
                <tr>
                  <th className="text-left p-3 text-zinc-400 font-medium">User</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Email</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Role</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-800/50 last:border-b-0">
                    <td className="p-3 font-medium">{m.profile.fullName ?? "—"}</td>
                    <td className="p-3 text-zinc-400">{m.profile.email}</td>
                    <td className="p-3">
                      <Badge variant={m.role === "org_admin" ? "green" : "default"}>{m.role}</Badge>
                    </td>
                    <td className="p-3 text-zinc-500">{m.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No members yet. Invite an org admin to get started.</p>
        )}
      </section>

      {/* Invites section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Invites ({invites.length})</h2>
          <Link
            href={`/admin/organizations/${org.id}/invites/new`}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            Send Invite
          </Link>
        </div>
        {invites.length > 0 ? (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/50">
                <tr>
                  <th className="text-left p-3 text-zinc-400 font-medium">Email</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Role</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Status</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Sent by</th>
                  <th className="text-left p-3 text-zinc-400 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const isPending = !inv.acceptedAt && inv.expiresAt > new Date();
                  const isAccepted = !!inv.acceptedAt;
                  const isExpired = !inv.acceptedAt && inv.expiresAt <= new Date();
                  return (
                    <tr key={inv.id} className="border-b border-zinc-800/50 last:border-b-0">
                      <td className="p-3">{inv.email}</td>
                      <td className="p-3">
                        <Badge>{inv.role}</Badge>
                      </td>
                      <td className="p-3">
                        {isAccepted && <Badge variant="green">Accepted</Badge>}
                        {isPending && <Badge variant="yellow">Pending</Badge>}
                        {isExpired && <Badge variant="red">Expired</Badge>}
                      </td>
                      <td className="p-3 text-zinc-500">{inv.invitedBy.email}</td>
                      <td className="p-3 text-zinc-500">{inv.createdAt.toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">No invites sent yet.</p>
        )}
      </section>
    </div>
  );
}
