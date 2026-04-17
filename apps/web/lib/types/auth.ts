/**
 * Shared types for the multi-tenant identity and access model.
 *
 * These mirror the Prisma schema but are decoupled so UI code can import
 * lightweight types without pulling in the Prisma client.
 */

export const MEMBERSHIP_ROLES = [
  "org_admin",
  "store_admin",
  "manager",
  "viewer",
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export function isValidRole(value: string): value is MembershipRole {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

/** Role ordering from most to least privileged (for comparison helpers). */
const ROLE_WEIGHT: Record<MembershipRole, number> = {
  org_admin: 40,
  store_admin: 30,
  manager: 20,
  viewer: 10,
};

export function roleAtLeast(
  userRole: MembershipRole,
  requiredRole: MembershipRole
): boolean {
  return ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole];
}

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

export type ProfileSummary = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

export type MembershipWithContext = {
  id: string;
  organizationId: string;
  organization: OrganizationSummary;
  role: MembershipRole;
  storeIds: string[];
};

/**
 * Represents the fully-resolved identity of a logged-in user.
 * Assembled server-side from the JWT + DB lookups.
 * NOT stored in the JWT — rebuilt per request.
 */
export type SessionUser = {
  profileId: string;
  email: string;
  fullName: string | null;
  isPlatformAdmin: boolean;
  memberships: MembershipWithContext[];
};

export type StoreSummary = {
  id: string;
  name: string;
  abbreviation: string | null;
};

/**
 * The resolved organization context for the current request.
 * Determined from a cookie preference validated against the user's memberships.
 */
export type OrgContext = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: MembershipRole;
  membershipId: string;
  accessibleStoreIds: string[];
};

export type AppContext = {
  user: SessionUser;
  org: OrgContext;
};

export type InviteStatus = "pending" | "accepted" | "expired";

export function inviteStatus(invite: {
  acceptedAt: Date | null;
  expiresAt: Date;
}): InviteStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.expiresAt < new Date()) return "expired";
  return "pending";
}
