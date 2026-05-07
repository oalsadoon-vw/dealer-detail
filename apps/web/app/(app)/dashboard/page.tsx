import {
  resolveTenantContext,
  loadSessionUserOrNull,
} from "@/lib/server/tenant-context";
import { listAccessibleStores } from "@/lib/server/services/stores";
import {
  loadDashboardData,
  type DashboardData,
} from "@/lib/server/services/dashboard";
import { redirect } from "next/navigation";
import { isAppError } from "@/lib/server/errors";
import DashboardClient from "./ui";

export const dynamic = "force-dynamic";

/**
 * Compute the same default month-to-date range that the client useEffect
 * was computing post-mount. Hoisting it here lets us pre-load matching
 * data so the client never has to re-fetch on first paint.
 */
function defaultRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  return {
    startDate: first.toISOString().slice(0, 10),
    endDate: today.toISOString().slice(0, 10),
  };
}

export default async function DashboardPage() {
  let tc;
  try {
    tc = await resolveTenantContext();
  } catch (err) {
    if (isAppError(err)) {
      // If the user is a platform admin with no org context, sending them
      // to /login would loop (middleware bounces them back to /dashboard).
      // Route them to the admin panel instead — that's where they belong.
      const session = await loadSessionUserOrNull();
      if (session?.isPlatformAdmin) {
        redirect("/admin");
      }
      redirect("/login");
    }
    throw err;
  }

  const stores = await listAccessibleStores(tc);
  const initialStoreId = stores[0]?.id ?? "";
  const { startDate, endDate } = defaultRange();

  // Pre-load the default-view data on the server so the client renders
  // the dashboard immediately instead of mounting → fetching → flashing.
  // If anything goes wrong (rare — auth/permissions), we still send the
  // shell with `initialData=null` and the client recovers via /api/dashboard.
  let initialData: DashboardData | null = null;
  if (initialStoreId) {
    try {
      initialData = await loadDashboardData(tc, {
        storeId: initialStoreId,
        startDate,
        endDate,
      });
    } catch {
      initialData = null;
    }
  }

  return (
    <DashboardClient
      initialStores={stores.map((s) => ({ id: s.id, name: s.name }))}
      initialStoreId={initialStoreId}
      initialStartDate={startDate}
      initialEndDate={endDate}
      initialData={initialData}
    />
  );
}
