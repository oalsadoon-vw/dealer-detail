-- Add labor gross tracking to commodity buckets (parity with legacy sheet rollups).

ALTER TABLE "AdvisorDailyCommodity"
ADD COLUMN "laborGross" DOUBLE PRECISION NOT NULL DEFAULT 0;


