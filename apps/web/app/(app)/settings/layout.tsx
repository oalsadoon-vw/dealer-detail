import { redirect } from "next/navigation";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { isAppError } from "@/lib/server/errors";
import { SectionHeading } from "@/components/ui";
import SettingsTabs from "./settings-tabs";

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
      <SectionHeading
        title="Settings"
        description={`Manage ${tc.org.organizationName}`}
        size="page"
      />
      <SettingsTabs />
      {children}
    </div>
  );
}
