import { resolveTenantContext } from "@/lib/server/tenant-context";
import { listAccessibleStores } from "@/lib/server/services/stores";
import { redirect } from "next/navigation";
import { isAppError } from "@/lib/server/errors";
import { roleAtLeast } from "@/lib/types/auth";
import RunsClient from "./ui";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  let tc;
  try {
    tc = await resolveTenantContext();
  } catch (err) {
    if (isAppError(err)) redirect("/login");
    throw err;
  }

  const stores = await listAccessibleStores(tc);
  const canWrite =
    tc.user.isPlatformAdmin || roleAtLeast(tc.org.role, "manager");

  return (
    <RunsClient
      initialStores={stores.map((s) => ({ id: s.id, name: s.name }))}
      canWrite={canWrite}
    />
  );
}
