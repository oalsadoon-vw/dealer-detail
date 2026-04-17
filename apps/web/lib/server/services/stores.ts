import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/server/tenant-context";
import type { StoreSummary } from "@/lib/types/auth";
import { requireOrgAdmin, requireStoreAccess } from "@/lib/server/authz";

/**
 * Returns stores the current user can access in their active org.
 */
export async function listAccessibleStores(
  tc: TenantContext
): Promise<StoreSummary[]> {
  if (tc.user.isPlatformAdmin || tc.org.role === "org_admin") {
    return prisma.store.findMany({
      where: { organizationId: tc.org.organizationId },
      select: { id: true, name: true, abbreviation: true },
      orderBy: { name: "asc" },
    });
  }

  if (tc.org.accessibleStoreIds.length === 0) return [];

  return prisma.store.findMany({
    where: {
      id: { in: tc.org.accessibleStoreIds },
      organizationId: tc.org.organizationId,
    },
    select: { id: true, name: true, abbreviation: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Creates a store in the user's active organization.
 * Requires org_admin role.
 */
export async function createStore(
  tc: TenantContext,
  data: { name: string; abbreviation?: string; timezone?: string }
) {
  requireOrgAdmin(tc);

  return prisma.store.create({
    data: {
      organizationId: tc.org.organizationId,
      name: data.name,
      timezone: data.timezone,
      abbreviation: data.abbreviation
        ? data.abbreviation.trim().toUpperCase()
        : null,
    },
  });
}

/**
 * Validates that the caller can access a store and that the store
 * belongs to the current org. Useful as a gate before any store-scoped
 * data operation.
 */
export function assertStoreAccess(
  tc: TenantContext,
  storeId: string
): void {
  requireStoreAccess(tc, storeId);
}
