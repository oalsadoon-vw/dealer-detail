-- Add store abbreviation for mapping Excel filenames to stores (e.g. BST, SCVW).

ALTER TABLE "Store"
ADD COLUMN "abbreviation" TEXT;

CREATE UNIQUE INDEX "Store_abbreviation_key" ON "Store"("abbreviation");


