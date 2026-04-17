-- Migration: enable_rls_policies
-- Enables Row Level Security on ALL application tables and creates
-- defense-in-depth policies for the Supabase `authenticated` role.
--
-- WHY: The NEXT_PUBLIC_SUPABASE_ANON_KEY is in the browser. Without RLS,
-- anyone could query the PostgREST API directly. Enabling RLS with deny-
-- by-default blocks all PostgREST access except what policies explicitly
-- allow.
--
-- HOW DATA FLOWS:
--   - Prisma connects as the `postgres` role → bypasses RLS → unaffected.
--   - PostgREST uses `anon`/`authenticated` roles → subject to RLS.
--   - No policies for `anon` → complete deny for unauthenticated PostgREST.
--   - Policies for `authenticated` → scoped to the user's org memberships.
--
-- SAFE ROLLBACK: disable RLS on each table if needed.

-- ============================================================================
-- Helper functions
-- ============================================================================

CREATE OR REPLACE FUNCTION auth.user_id() RETURNS TEXT AS $$
  SELECT COALESCE(auth.uid()::text, '');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Returns org IDs the authenticated user is a member of
CREATE OR REPLACE FUNCTION public.user_org_ids() RETURNS SETOF TEXT AS $$
  SELECT "organizationId"
  FROM "Membership"
  WHERE "profileId" = auth.uid()::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Returns store IDs the authenticated user can access
-- (org_admins get all stores in their orgs; others get only assigned stores)
CREATE OR REPLACE FUNCTION public.user_store_ids() RETURNS SETOF TEXT AS $$
  -- Stores via org_admin membership (all stores in the org)
  SELECT s."id"
  FROM "Store" s
  INNER JOIN "Membership" m ON m."organizationId" = s."organizationId"
  WHERE m."profileId" = auth.uid()::text
    AND m."role" = 'org_admin'
  UNION
  -- Stores via explicit StoreMembership
  SELECT sm."storeId"
  FROM "StoreMembership" sm
  INNER JOIN "Membership" m ON m."id" = sm."membershipId"
  WHERE m."profileId" = auth.uid()::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- 1. Enable RLS on all tables (deny-by-default)
-- ============================================================================

ALTER TABLE "Organization"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profile"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAdmin"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoreMembership"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invite"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Store"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Advisor"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IngestionRun"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IngestedFile"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RawReportRow"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorDailyMetrics"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorDailyCommodity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailSource"           ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Profile policies
-- ============================================================================

CREATE POLICY "profile_select_own" ON "Profile"
  FOR SELECT TO authenticated
  USING ("id" = auth.uid()::text);

CREATE POLICY "profile_select_org_members" ON "Profile"
  FOR SELECT TO authenticated
  USING (
    "id" IN (
      SELECT m2."profileId"
      FROM "Membership" m1
      JOIN "Membership" m2 ON m1."organizationId" = m2."organizationId"
      WHERE m1."profileId" = auth.uid()::text
    )
  );

CREATE POLICY "profile_update_own" ON "Profile"
  FOR UPDATE TO authenticated
  USING ("id" = auth.uid()::text)
  WITH CHECK ("id" = auth.uid()::text);

-- ============================================================================
-- 3. Organization policies
-- ============================================================================

CREATE POLICY "org_select_member" ON "Organization"
  FOR SELECT TO authenticated
  USING ("id" IN (SELECT public.user_org_ids()));

-- ============================================================================
-- 4. Membership policies
-- ============================================================================

CREATE POLICY "membership_select_same_org" ON "Membership"
  FOR SELECT TO authenticated
  USING ("organizationId" IN (SELECT public.user_org_ids()));

-- ============================================================================
-- 5. StoreMembership policies
-- ============================================================================

CREATE POLICY "store_membership_select" ON "StoreMembership"
  FOR SELECT TO authenticated
  USING (
    "membershipId" IN (
      SELECT "id" FROM "Membership"
      WHERE "organizationId" IN (SELECT public.user_org_ids())
    )
  );

-- ============================================================================
-- 6. Invite policies (read-only for org members)
-- ============================================================================

CREATE POLICY "invite_select_org" ON "Invite"
  FOR SELECT TO authenticated
  USING ("organizationId" IN (SELECT public.user_org_ids()));

-- ============================================================================
-- 7. PlatformAdmin policies (no PostgREST access at all)
-- ============================================================================

-- No policies → completely blocked via PostgREST.
-- Only accessible via Prisma (postgres role bypasses RLS).

-- ============================================================================
-- 8. Store policies
-- ============================================================================

CREATE POLICY "store_select_accessible" ON "Store"
  FOR SELECT TO authenticated
  USING ("id" IN (SELECT public.user_store_ids()));

-- ============================================================================
-- 9. Business data table policies (scoped via accessible stores)
-- ============================================================================

CREATE POLICY "advisor_select" ON "Advisor"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT public.user_store_ids()));

CREATE POLICY "ingestion_run_select" ON "IngestionRun"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT public.user_store_ids()));

CREATE POLICY "ingested_file_select" ON "IngestedFile"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT public.user_store_ids()));

CREATE POLICY "raw_report_row_select" ON "RawReportRow"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT public.user_store_ids()));

CREATE POLICY "advisor_daily_metrics_select" ON "AdvisorDailyMetrics"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT public.user_store_ids()));

CREATE POLICY "advisor_daily_commodity_select" ON "AdvisorDailyCommodity"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT public.user_store_ids()));

CREATE POLICY "email_source_select" ON "EmailSource"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT public.user_store_ids()));

-- ============================================================================
-- NOTE: No INSERT/UPDATE/DELETE policies for business data tables.
-- All writes go through Prisma (postgres role) which bypasses RLS.
-- This is intentional: the API layer enforces write authorization.
-- ============================================================================
