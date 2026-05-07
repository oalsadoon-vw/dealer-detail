-- Migration: secure_prisma_migrations
--
-- Closes a Supabase Security Advisor finding (`rls_disabled_in_public`)
-- on the Prisma-managed `_prisma_migrations` table.
--
-- WHY: This table lives in the `public` schema, which means PostgREST
-- exposes it through the anon/authenticated roles. Without RLS enabled,
-- anyone with the project's NEXT_PUBLIC_SUPABASE_ANON_KEY could read
-- (and in theory write to) the migration history.
--
-- HOW THIS WORKS:
--   * We enable RLS with NO policies. Postgres' default behaviour for
--     RLS-enabled tables is deny-by-default for any role that doesn't
--     match a policy — so anon/authenticated calls return zero rows
--     and writes are rejected.
--   * Prisma connects as the `postgres` superuser, which BYPASSRLS by
--     default, so `prisma migrate` keeps working unchanged.
--
-- ROLLBACK: ALTER TABLE "_prisma_migrations" DISABLE ROW LEVEL SECURITY;
--   (Not recommended — re-opens the security finding.)

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Belt and suspenders: also revoke explicit grants from anon/authenticated
-- so the table is invisible to PostgREST schema introspection. These
-- statements are idempotent — REVOKE is a no-op if the privilege wasn't
-- granted in the first place.
REVOKE ALL ON TABLE "_prisma_migrations" FROM anon;
REVOKE ALL ON TABLE "_prisma_migrations" FROM authenticated;
