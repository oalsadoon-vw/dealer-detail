-- Perf: closed-basis reports filtered RoOpFact by joining RoFact.status, which
-- Postgres planned as a full RoFact seq scan (6.5 s per store, 7.4 s YTD, Fleet
-- page = 7 of them in parallel through a 10-connection pool -> "Report query
-- failed"). Denormalize the RO status onto the op rows and index it.
--
-- NOTE (prod 2026-10-24): the backfill UPDATE on 886K rows exceeds the Supabase
-- pooler statement_timeout (2 min) and was applied manually over DIRECT_URL with
-- `SET statement_timeout = 0`, per store; then `prisma migrate resolve --applied`.
ALTER TABLE "RoOpFact" ADD COLUMN IF NOT EXISTS "roStatus" TEXT;

UPDATE "RoOpFact" o SET "roStatus" = f.status FROM "RoFact" f WHERE f.id = o."roFactId" AND o."roStatus" IS NULL;

CREATE INDEX IF NOT EXISTS "RoOpFact_storeId_roStatus_closeDate_idx" ON "RoOpFact"("storeId", "roStatus", "closeDate");
CREATE INDEX IF NOT EXISTS "RoOpFact_storeId_advisorId_roStatus_closeDate_idx" ON "RoOpFact"("storeId", "advisorId", "roStatus", "closeDate");
-- RoFact: the summary/advisor queries filter (storeId, closeDate) then status.
CREATE INDEX IF NOT EXISTS "RoFact_storeId_status_closeDate_idx" ON "RoFact"("storeId", "status", "closeDate");
