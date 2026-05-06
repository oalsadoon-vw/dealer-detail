import { redirect } from "next/navigation";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { isAppError } from "@/lib/server/errors";
import Link from "next/link";

const TABS = [
  { href: "/settings/organization", label: "Organization" },
  { href: "/settings/stores", label: "Stores" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/invites", label: "Invites" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let tc;
  try {
    tc = await resolveTenantContext();
  } catch (err) {
    if (isAppError(err)) redirect("/login");
    throw err;
  }

  const isOrgAdmin =
    tc.user.isPlatformAdmin || tc.org.role === "org_admin";

  if (!isOrgAdmin) redirect("/dashboard");

  return (
    <div className="fade-in-up space-y-6 min-w-0">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage {tc.org.organizationName}
        </p>
      </div>

      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto border-b border-zinc-200 pb-px">
        <div className="flex gap-1 w-max sm:w-auto">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="whitespace-nowrap rounded-t-md px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors border-b-2 border-transparent data-[active]:border-zinc-900 data-[active]:text-zinc-900"
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>

      {children}
    </div>
  );
}
