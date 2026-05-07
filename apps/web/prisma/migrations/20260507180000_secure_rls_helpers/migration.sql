-- Migration: secure_rls_helpers
-- WHY: Supabase security advisor flags two issues with our RLS helpers:
--   1. `function_search_path_mutable` — search_path is not pinned, so an
--      attacker who can create objects in another schema could shadow them.
--   2. `*_security_definer_function_executable` — because the helpers live in
--      the `public` schema, PostgREST exposes them as
--      `/rest/v1/rpc/user_org_ids` and `/rest/v1/rpc/user_store_ids`. Anyone
--      with the anon/authenticated key can call them. They only return data
--      the caller can already see, but it is still leakage we don't want.
--
-- FIX: Move the two helpers into a `private` schema (PostgREST only exposes
-- `public` and `graphql_public`, so anything in `private` is invisible from
-- the REST API). Pin search_path to `public, pg_catalog`. Grant EXECUTE only
-- to `authenticated` (RLS policies need to call them). Recreate every
-- dependent policy to point at the new private.* helpers, then drop the old
-- public functions.

-- ============================================================================
-- 1. Create private schema for internal helpers
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;

GRANT USAGE ON SCHEMA private TO authenticated;

-- ============================================================================
-- 2. Recreate helpers in private schema with pinned search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION private.user_org_ids() RETURNS SETOF TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  SELECT "organizationId"
  FROM public."Membership"
  WHERE "profileId" = auth.uid()::text;
$$;

CREATE OR REPLACE FUNCTION private.user_store_ids() RETURNS SETOF TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  SELECT s."id"
  FROM public."Store" s
  INNER JOIN public."Membership" m ON m."organizationId" = s."organizationId"
  WHERE m."profileId" = auth.uid()::text
    AND m."role" = 'org_admin'
  UNION
  SELECT sm."storeId"
  FROM public."StoreMembership" sm
  INNER JOIN public."Membership" m ON m."id" = sm."membershipId"
  WHERE m."profileId" = auth.uid()::text;
$$;

-- Lock down EXECUTE so only `authenticated` (the role used by signed-in
-- PostgREST callers, and the role under which RLS policies evaluate) can
-- invoke the helpers. `anon` and `public` are deliberately excluded.
REVOKE EXECUTE ON FUNCTION private.user_org_ids()    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.user_store_ids()  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION private.user_org_ids()    TO authenticated;
GRANT  EXECUTE ON FUNCTION private.user_store_ids()  TO authenticated;

-- ============================================================================
-- 3. Drop policies that reference the old public.user_*_ids helpers
-- ============================================================================

DROP POLICY IF EXISTS "org_select_member"             ON public."Organization";
DROP POLICY IF EXISTS "membership_select_same_org"    ON public."Membership";
DROP POLICY IF EXISTS "store_membership_select"       ON public."StoreMembership";
DROP POLICY IF EXISTS "invite_select_org"             ON public."Invite";
DROP POLICY IF EXISTS "store_select_accessible"       ON public."Store";
DROP POLICY IF EXISTS "advisor_select"                ON public."Advisor";
DROP POLICY IF EXISTS "ingestion_run_select"          ON public."IngestionRun";
DROP POLICY IF EXISTS "ingested_file_select"          ON public."IngestedFile";
DROP POLICY IF EXISTS "raw_report_row_select"         ON public."RawReportRow";
DROP POLICY IF EXISTS "advisor_daily_metrics_select"  ON public."AdvisorDailyMetrics";
DROP POLICY IF EXISTS "advisor_daily_commodity_select" ON public."AdvisorDailyCommodity";
DROP POLICY IF EXISTS "email_source_select"           ON public."EmailSource";

-- ============================================================================
-- 4. Recreate the same policies, now calling private.user_*_ids
-- ============================================================================

CREATE POLICY "org_select_member" ON public."Organization"
  FOR SELECT TO authenticated
  USING ("id" IN (SELECT private.user_org_ids()));

CREATE POLICY "membership_select_same_org" ON public."Membership"
  FOR SELECT TO authenticated
  USING ("organizationId" IN (SELECT private.user_org_ids()));

CREATE POLICY "store_membership_select" ON public."StoreMembership"
  FOR SELECT TO authenticated
  USING (
    "membershipId" IN (
      SELECT "id" FROM public."Membership"
      WHERE "organizationId" IN (SELECT private.user_org_ids())
    )
  );

CREATE POLICY "invite_select_org" ON public."Invite"
  FOR SELECT TO authenticated
  USING ("organizationId" IN (SELECT private.user_org_ids()));

CREATE POLICY "store_select_accessible" ON public."Store"
  FOR SELECT TO authenticated
  USING ("id" IN (SELECT private.user_store_ids()));

CREATE POLICY "advisor_select" ON public."Advisor"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));

CREATE POLICY "ingestion_run_select" ON public."IngestionRun"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));

CREATE POLICY "ingested_file_select" ON public."IngestedFile"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));

CREATE POLICY "raw_report_row_select" ON public."RawReportRow"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));

CREATE POLICY "advisor_daily_metrics_select" ON public."AdvisorDailyMetrics"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));

CREATE POLICY "advisor_daily_commodity_select" ON public."AdvisorDailyCommodity"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));

CREATE POLICY "email_source_select" ON public."EmailSource"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));

-- ============================================================================
-- 5. Drop the old public helpers so they no longer surface in PostgREST
-- ============================================================================

DROP FUNCTION IF EXISTS public.user_org_ids();
DROP FUNCTION IF EXISTS public.user_store_ids();
