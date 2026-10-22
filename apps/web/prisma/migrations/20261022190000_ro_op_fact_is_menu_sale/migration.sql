-- T9 §6: scorecard menu-sale flag (isMenu AND laborSale > 0).
ALTER TABLE "RoOpFact" ADD COLUMN "isMenuSale" BOOLEAN NOT NULL DEFAULT false;

-- Backfill from existing facts so reports are correct immediately; the next
-- facts rebuild recomputes RoFact.hasMenu/menuLines/menu$ from this flag.
UPDATE "RoOpFact" SET "isMenuSale" = true WHERE "isMenu" = true AND "laborSale" > 0;

CREATE INDEX "RoOpFact_storeId_isMenuSale_closeDate_idx" ON "RoOpFact"("storeId", "isMenuSale", "closeDate");
