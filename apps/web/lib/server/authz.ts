import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/types/auth";
import type { MembershipRole } from "@/lib/types/auth";
import type { TenantContext } from "./tenant-context";
import { ForbiddenError, NotFoundError } from "./errors";

// ---------------------------------------------------------------------------
// Role assertions — throw ForbiddenError on failure
// ---------------------------------------------------------------------------

export function requirePlatformAdmin(tc: TenantContext): void {
  if (!tc.user.isPlatformAdmin) {
    throw new ForbiddenError("Platform admin access required");
  }
}

export function requireOrgAdmin(tc: TenantContext): void {
  if (tc.user.isPlatformAdmin) return;
  if (tc.org.role !== "org_admin") {
    throw new ForbiddenError("Organization admin access required");
  }
}

export function requireManagerOrHigher(tc: TenantContext): void {
  if (tc.user.isPlatformAdmin) return;
  if (!roleAtLeast(tc.org.role, "manager")) {
    throw new ForbiddenError("Manager or higher access required");
  }
}

export function requireRole(tc: TenantContext, minRole: MembershipRole): void {
  if (tc.user.isPlatformAdmin) return;
  if (!roleAtLeast(tc.org.role, minRole)) {
    throw new ForbiddenError(`Role '${minRole}' or higher required`);
  }
}

// ---------------------------------------------------------------------------
// Store access assertions
// ---------------------------------------------------------------------------

export function requireStoreAccess(tc: TenantContext, storeId: string): void {
  if (tc.user.isPlatformAdmin) return;
  if (!tc.org.accessibleStoreIds.includes(storeId)) {
    throw new ForbiddenError("Access to this store is not permitted");
  }
}

/**
 * Verifies a store belongs to the tenant's current org.
 * Prevents cross-org data manipulation even when the caller has valid auth.
 */
export async function assertStoreBelongsToOrg(
  storeId: string,
  orgId: string
): Promise<void> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { organizationId: true },
  });

  if (!store) throw new NotFoundError("Store not found");

  if (store.organizationId !== orgId) {
    throw new ForbiddenError("Store does not belong to current organization");
  }
}

// ---------------------------------------------------------------------------
// Membership assertions
// ---------------------------------------------------------------------------

export function assertMembershipInOrg(
  tc: TenantContext,
  orgId: string
): void {
  if (tc.user.isPlatformAdmin) return;
  const hasMembership = tc.user.memberships.some(
    (m) => m.organizationId === orgId
  );
  if (!hasMembership) {
    throw new ForbiddenError("No membership in the target organization");
  }
}

// ---------------------------------------------------------------------------
// Resource ownership — look up a resource and check the user can access it
// ---------------------------------------------------------------------------

/**
 * Looks up an ingestion run by ID and asserts the user can access its store.
 * Returns the run record (storeId + businessDate) for further use.
 */
export async function requireRunAccess(
  tc: TenantContext,
  runId: string
): Promise<{ storeId: string; businessDate: Date }> {
  const run = await prisma.ingestionRun.findUnique({
    where: { id: runId },
    select: { storeId: true, businessDate: true },
  });

  if (!run) throw new NotFoundError("Run not found");
  requireStoreAccess(tc, run.storeId);
  return run;
}

/**
 * Looks up an ingested file by ID and asserts the user can access its store.
 */
export async function requireFileAccess(
  tc: TenantContext,
  fileId: string
): Promise<{ storeId: string }> {
  const file = await prisma.ingestedFile.findUnique({
    where: { id: fileId },
    select: { storeId: true },
  });

  if (!file) throw new NotFoundError("File not found");
  requireStoreAccess(tc, file.storeId);
  return file;
}
