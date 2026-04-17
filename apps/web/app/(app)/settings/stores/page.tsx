import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireOrgAdmin } from "@/lib/server/authz";
import { listAccessibleStores } from "@/lib/server/services/stores";
import StoresManager from "@/components/StoresManager";

export const dynamic = "force-dynamic";

export default async function SettingsStoresPage() {
  const tc = await resolveTenantContext();
  requireOrgAdmin(tc);

  const stores = await listAccessibleStores(tc);

  return <StoresManager initialStores={stores} canCreate />;
}
