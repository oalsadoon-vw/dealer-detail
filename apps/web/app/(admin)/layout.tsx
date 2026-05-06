import { redirect } from "next/navigation";
import { resolveSessionUser } from "@/lib/server/tenant-context";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await resolveSessionUser();
  } catch {
    redirect("/login");
  }

  if (!user.isPlatformAdmin) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-y-2 px-4 sm:px-6 py-2 sm:h-14 min-w-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <Link href="/admin" className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 shrink-0 rounded bg-red-600 text-white grid place-items-center text-xs font-bold">
                SA
              </div>
              <span className="font-semibold text-sm truncate">Platform Admin</span>
            </Link>
            <nav className="flex items-center gap-1 sm:ml-4">
              <Link
                href="/admin/organizations"
                className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors whitespace-nowrap"
              >
                Organizations
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm min-w-0">
            <span className="hidden sm:inline text-zinc-500 truncate max-w-[200px]" title={user.email}>{user.email}</span>
            <Link
              href="/dashboard"
              className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors whitespace-nowrap"
            >
              Back to app
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 min-w-0">{children}</main>
    </div>
  );
}
