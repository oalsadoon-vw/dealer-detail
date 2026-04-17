import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentOrgContext } from "@/lib/auth/org-context";
import Sidebar from "@/components/Sidebar";
import type { SidebarUser } from "@/components/Sidebar";

/**
 * Protected app layout.
 *
 * 1. Resolves the authenticated user (bootstraps profile + resolves invites).
 * 2. Redirects to /pending-access if the user has no memberships.
 * 3. Resolves the active organization context.
 * 4. Passes user + org context to the Sidebar.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await getCurrentUser();

  if (!sessionUser) redirect("/login");

  const hasMemberships = sessionUser.memberships.length > 0;
  if (!hasMemberships && !sessionUser.isPlatformAdmin) {
    redirect("/pending-access");
  }

  const orgContext = await getCurrentOrgContext(sessionUser);

  const sidebarUser: SidebarUser = {
    email: sessionUser.email,
    fullName: sessionUser.fullName,
    orgName: orgContext?.organizationName ?? null,
    orgSlug: orgContext?.organizationSlug ?? null,
    role: orgContext?.role ?? null,
    orgs: sessionUser.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organization.name,
      slug: m.organization.slug,
    })),
    isPlatformAdmin: sessionUser.isPlatformAdmin,
  };

  return (
    <div className="min-h-screen md:grid md:grid-cols-[auto_1fr]">
      <Sidebar user={sidebarUser} />
      <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
