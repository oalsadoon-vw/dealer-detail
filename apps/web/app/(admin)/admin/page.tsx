import Link from "next/link";
import { prisma } from "@/lib/db";

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

  const stats = [
    { label: "Organizations", value: orgCount, href: "/admin/organizations" },
    { label: "Total Stores", value: storeCount },
    { label: "Registered Users", value: profileCount },
    { label: "Pending Invites", value: pendingInviteCount },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Platform Admin</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Internal management console for DealerDetail.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
            {s.href && (
              <Link
                href={s.href}
                className="mt-2 inline-block text-xs text-zinc-400 underline hover:text-white"
              >
                View all
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          href="/admin/organizations/new"
          className="rounded-md bg-white text-zinc-950 px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          Create Organization
        </Link>
        <Link
          href="/admin/organizations"
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
        >
          View Organizations
        </Link>
      </div>
    </div>
  );
}
