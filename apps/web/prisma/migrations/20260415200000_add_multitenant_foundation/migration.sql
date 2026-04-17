-- Migration: add_multitenant_foundation
-- Phase 1 of multi-tenant SaaS evolution.
-- Adds identity/access tables and links Store to Organization.
-- Safe: all changes are additive. Existing data is preserved via backfill.

-- ============================================================================
-- 1. New tables: Organization, Profile, PlatformAdmin, Membership,
--    StoreMembership, Invite
-- ============================================================================

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "settings" JSONB,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- ---

CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "avatarUrl" TEXT,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- ---

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "profileId" TEXT NOT NULL,
    "grantedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_profileId_key" ON "PlatformAdmin"("profileId");

ALTER TABLE "PlatformAdmin"
    ADD CONSTRAINT "PlatformAdmin_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Membership_organizationId_profileId_key"
    ON "Membership"("organizationId", "profileId");

CREATE INDEX "Membership_profileId_idx" ON "Membership"("profileId");

ALTER TABLE "Membership"
    ADD CONSTRAINT "Membership_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Membership"
    ADD CONSTRAINT "Membership_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---

CREATE TABLE "StoreMembership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "membershipId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "StoreMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreMembership_membershipId_storeId_key"
    ON "StoreMembership"("membershipId", "storeId");

CREATE INDEX "StoreMembership_storeId_idx" ON "StoreMembership"("storeId");

ALTER TABLE "StoreMembership"
    ADD CONSTRAINT "StoreMembership_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "Membership"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreMembership"
    ADD CONSTRAINT "StoreMembership_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---

CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");
CREATE INDEX "Invite_email_idx" ON "Invite"("email");
CREATE INDEX "Invite_token_idx" ON "Invite"("token");
CREATE INDEX "Invite_organizationId_idx" ON "Invite"("organizationId");

ALTER TABLE "Invite"
    ADD CONSTRAINT "Invite_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invite"
    ADD CONSTRAINT "Invite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "Profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- 2. Add organizationId to Store (nullable first for safe backfill)
-- ============================================================================

ALTER TABLE "Store" ADD COLUMN "organizationId" TEXT;

-- ============================================================================
-- 3. Seed default organization and backfill existing stores
-- ============================================================================

INSERT INTO "Organization" ("id", "createdAt", "updatedAt", "name", "slug")
VALUES (
    '00000000-0000-0000-0000-000000000001',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'Default Organization',
    'default'
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Store"
SET "organizationId" = '00000000-0000-0000-0000-000000000001'
WHERE "organizationId" IS NULL;

-- ============================================================================
-- 4. Make organizationId NOT NULL and add FK + index
-- ============================================================================

ALTER TABLE "Store" ALTER COLUMN "organizationId" SET NOT NULL;

CREATE INDEX "Store_organizationId_idx" ON "Store"("organizationId");

ALTER TABLE "Store"
    ADD CONSTRAINT "Store_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
