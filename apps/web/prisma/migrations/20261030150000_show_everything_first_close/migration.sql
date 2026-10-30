-- show-everything D10/D11: original close date + reopen/re-close tracking
ALTER TABLE "RoFact"
  ADD COLUMN "firstCloseDate" TIMESTAMP(3),
  ADD COLUMN "wasReclosed"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reopenCount"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastReopenedAt" TIMESTAMP(3),
  ADD COLUMN "lastReclosedAt" TIMESTAMP(3);

ALTER TABLE "RoOpFact" ADD COLUMN "firstCloseDate" TIMESTAMP(3);

CREATE TABLE "RoStatusEvent" (
    "id" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "roFactId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "closeDateBefore" TIMESTAMP(3),
    "closeDateAfter" TIMESTAMP(3),
    "laborSaleBefore" DOUBLE PRECISION,
    "laborSaleAfter" DOUBLE PRECISION,
    "partsSaleBefore" DOUBLE PRECISION,
    "partsSaleAfter" DOUBLE PRECISION,
    CONSTRAINT "RoStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoFact_storeId_status_firstCloseDate_idx" ON "RoFact"("storeId", "status", "firstCloseDate");
CREATE INDEX "RoFact_storeId_status_openDate_idx" ON "RoFact"("storeId", "status", "openDate");
CREATE INDEX "RoOpFact_storeId_roStatus_firstCloseDate_idx" ON "RoOpFact"("storeId", "roStatus", "firstCloseDate");
CREATE INDEX "RoStatusEvent_storeId_observedAt_idx" ON "RoStatusEvent"("storeId", "observedAt");
CREATE INDEX "RoStatusEvent_roFactId_idx" ON "RoStatusEvent"("roFactId");

ALTER TABLE "RoStatusEvent" ADD CONSTRAINT "RoStatusEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoStatusEvent" ADD CONSTRAINT "RoStatusEvent_roFactId_fkey" FOREIGN KEY ("roFactId") REFERENCES "RoFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed firstCloseDate = closeDate for everything already observed (re-close
-- correction for prior-month invoices is done by scripts/backfill-first-close.ts).
UPDATE "RoFact"   SET "firstCloseDate" = "closeDate" WHERE "firstCloseDate" IS NULL AND "closeDate" IS NOT NULL;
UPDATE "RoOpFact" SET "firstCloseDate" = "closeDate" WHERE "firstCloseDate" IS NULL AND "closeDate" IS NOT NULL;
