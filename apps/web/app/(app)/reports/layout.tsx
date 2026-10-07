import { resolveTenantContext } from "@/lib/server/tenant-context";
import { prisma } from "@/lib/db";
import { ReportsShell } from "./shell";

export const dynamic = "force-dynamic";

/**
 * /reports/* — the v2 Tekion-API-fed report suite. Server layout resolves the
 * accessible store list once; every child page is a client component that
 * reads filters from the URL and fetches /api/reports/<kind>.
 */
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const tc = await resolveTenantContext();
  const stores = tc.org.accessibleStoreIds.length
    ? await prisma.store.findMany({
        where: { id: { in: tc.org.accessibleStoreIds }, organizationId: tc.org.organizationId },
        select: { id: true, name: true, abbreviation: true },
        orderBy: { name: "asc" },
      })
    : [];
  return <ReportsShell stores={stores}>{children}</ReportsShell>;
}
