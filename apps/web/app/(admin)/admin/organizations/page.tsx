import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OrganizationsListPage() {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { stores: true, memberships: true, invites: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Organizations</h1>
          <p className="text-sm text-zinc-500">{orgs.length} total</p>
        </div>
        <Link
          href="/admin/organizations/new"
          className="rounded-md bg-white text-zinc-950 px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          Create Organization
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/50">
            <tr>
              <th className="text-left p-3 text-zinc-400 font-medium">Name</th>
              <th className="text-left p-3 text-zinc-400 font-medium">Slug</th>
              <th className="text-center p-3 text-zinc-400 font-medium">Stores</th>
              <th className="text-center p-3 text-zinc-400 font-medium">Members</th>
              <th className="text-center p-3 text-zinc-400 font-medium">Invites</th>
              <th className="text-left p-3 text-zinc-400 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr
                key={org.id}
                className="border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-900/30 transition-colors"
              >
                <td className="p-3">
                  <Link
                    href={`/admin/organizations/${org.id}`}
                    className="font-medium text-white hover:underline"
                  >
                    {org.name}
                  </Link>
                </td>
                <td className="p-3 font-mono text-zinc-500">{org.slug}</td>
                <td className="p-3 text-center">{org._count.stores}</td>
                <td className="p-3 text-center">{org._count.memberships}</td>
                <td className="p-3 text-center">{org._count.invites}</td>
                <td className="p-3 text-zinc-500">
                  {org.createdAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-zinc-600">
                  No organizations yet.{" "}
                  <Link href="/admin/organizations/new" className="underline text-zinc-400">
                    Create one
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
