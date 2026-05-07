import { redirect } from "next/navigation";
import { resolveSessionUser } from "@/lib/server/tenant-context";
import Link from "next/link";
import { LinkButton, ThemeToggle } from "@/components/ui";

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
    <div className="min-h-screen bg-canvas text-fg">
      <header className="border-b border-line bg-surface/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-y-2 px-4 sm:px-6 py-2 sm:h-14 min-w-0">
          <div className="flex items-center gap-3 sm:gap-5 min-w-0">
            <Link
              href="/admin"
              className="flex items-center gap-2 min-w-0 group"
            >
              <div className="h-7 w-7 shrink-0 rounded-md bg-danger text-white grid place-items-center text-[10px] font-bold tracking-wider shadow-sm group-hover:scale-105 transition-transform">
                SA
              </div>
              <span className="font-semibold text-sm text-fg-strong tracking-tight truncate">
                Platform Admin
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/admin/organizations"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-muted hover:text-fg-strong hover:bg-surface-2 transition-colors whitespace-nowrap"
              >
                Organizations
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm min-w-0">
            <span
              className="hidden sm:inline text-fg-subtle truncate max-w-[200px]"
              title={user.email}
            >
              {user.email}
            </span>
            <ThemeToggle />
            <LinkButton href="/dashboard" variant="secondary" size="sm">
              Back to app
            </LinkButton>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 min-w-0">
        {children}
      </main>
    </div>
  );
}
