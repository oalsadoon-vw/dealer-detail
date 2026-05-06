import { resolveTenantContext } from "@/lib/server/tenant-context";
import { listAccessibleStores } from "@/lib/server/services/stores";
import { listRunsForStore, type RunRow } from "@/lib/server/services/runs";
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

  const initialStoreId = stores[0]?.id ?? "";
  let initialRuns: RunRow[] = [];
  if (initialStoreId) {
    try {
      initialRuns = await listRunsForStore(tc, initialStoreId);
    } catch {
      initialRuns = [];
    }
  }

  return (
    <RunsClient
      initialStores={stores.map((s) => ({ id: s.id, name: s.name }))}
      initialStoreId={initialStoreId}
      initialRuns={initialRuns}
      canWrite={canWrite}
    />
  );
}
