import { resolveTenantContext } from "@/lib/server/tenant-context";
import { listAccessibleStores } from "@/lib/server/services/stores";
import { redirect } from "next/navigation";
import { isAppError } from "@/lib/server/errors";
import DashboardClient from "./ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let tc;
  try {
    tc = await resolveTenantContext();
  } catch (err) {
    if (isAppError(err)) redirect("/login");
    throw err;
  }

  const stores = await listAccessibleStores(tc);

  return (
    <DashboardClient
      initialStores={stores.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
