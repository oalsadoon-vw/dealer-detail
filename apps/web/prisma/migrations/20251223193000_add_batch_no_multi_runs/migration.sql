-- Add batchNo and allow multiple runs per store+businessDate.
-- This migration:
-- 1) Adds batchNo
-- 2) Backfills batchNo per store (row_number by createdAt)
-- 3) Drops old unique constraint (storeId, businessDate)
-- 4) Adds new unique constraint (storeId, batchNo)

ALTER TABLE "IngestionRun" ADD COLUMN "batchNo" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "storeId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "IngestionRun"
)
UPDATE "IngestionRun" r
SET "batchNo" = n.rn
FROM numbered n
WHERE r."id" = n."id";

ALTER TABLE "IngestionRun" ALTER COLUMN "batchNo" SET NOT NULL;

-- Drop old uniqueness by day (was: one run per store per day)
DROP INDEX IF EXISTS "IngestionRun_storeId_businessDate_key";

-- New uniqueness by per-store serial batch number
CREATE UNIQUE INDEX "IngestionRun_storeId_batchNo_key" ON "IngestionRun"("storeId", "batchNo");


