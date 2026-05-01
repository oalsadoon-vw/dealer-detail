-- ---------------------------------------------------------------------------
-- Promote EmailSource to be org-scoped instead of strictly per-store.
--
--   Before: every EmailSource has a required storeId. To run one DMS feed
--           (e.g. reportbuilder@tekion.com) across N stores in one org,
--           the admin had to insert N near-duplicate rows.
--
--   After:  every EmailSource has a required organizationId. storeId becomes
--           an OPTIONAL per-store override (NULL = org-wide). The cron uses
--           org-scoped abbreviation matching to route attachments to the
--           right store within the source's org.
-- ---------------------------------------------------------------------------

-- 1. Add organizationId (nullable while we backfill).
ALTER TABLE "EmailSource" ADD COLUMN "organizationId" TEXT;

-- 2. Backfill organizationId from the related Store. Every existing row has
--    a non-null storeId so this is total.
UPDATE "EmailSource" e
SET "organizationId" = s."organizationId"
FROM "Store" s
WHERE e."storeId" = s."id";

-- 3. Defensively dedupe rows that would collide on (organizationId, senderEmail)
--    after the unique constraint goes in. Keep the most recently processed
--    (or, failing that, most recently created) row per (org, sender).
DELETE FROM "EmailSource" e1
USING "EmailSource" e2
WHERE e1."id" <> e2."id"
  AND e1."organizationId" = e2."organizationId"
  AND lower(e1."senderEmail") = lower(e2."senderEmail")
  AND (
    COALESCE(e1."lastProcessedAt", e1."createdAt")
    < COALESCE(e2."lastProcessedAt", e2."createdAt")
  );

-- 4. Lock organizationId to NOT NULL.
ALTER TABLE "EmailSource" ALTER COLUMN "organizationId" SET NOT NULL;

-- 5. Make storeId optional (kept as a per-store override).
ALTER TABLE "EmailSource" ALTER COLUMN "storeId" DROP NOT NULL;

-- 6. New foreign key to Organization (cascade on org delete).
ALTER TABLE "EmailSource"
  ADD CONSTRAINT "EmailSource_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Indexes + uniqueness.
CREATE INDEX "EmailSource_organizationId_idx" ON "EmailSource"("organizationId");
CREATE UNIQUE INDEX "EmailSource_organizationId_senderEmail_key"
  ON "EmailSource"("organizationId", "senderEmail");
