-- Covering indexes so every report aggregate is an index-only scan of the
-- (store, status, date) range instead of 400-byte heap rows pulled through a
-- cold Supabase buffer cache (first-hit queries were 2-7 s; now <100 ms).
-- Applied on prod 2026-10-24 CONCURRENTLY over DIRECT_URL (statement_timeout=0)
-- then `prisma migrate resolve --applied`. Prisma can't run CONCURRENTLY inside
-- its migration transaction, so plain CREATE INDEX here for fresh environments.
CREATE INDEX IF NOT EXISTS "RoOpFact_cover_closed_idx" ON "RoOpFact"("storeId","roStatus","closeDate")
  INCLUDE ("payClass","advisorId","opcode","category","documentId","isMenuSale","laborSale","laborCost","partsSale","partsCost","billHours","partsQty");
CREATE INDEX IF NOT EXISTS "RoOpFact_cover_opened_idx" ON "RoOpFact"("storeId","openDate")
  INCLUDE ("payClass","advisorId","opcode","category","documentId","isMenuSale","laborSale","laborCost","partsSale","partsCost","billHours","partsQty");
CREATE INDEX IF NOT EXISTS "RoFact_cover_closed_idx" ON "RoFact"("storeId","status","closeDate")
  INCLUDE ("advisorId","isClosed","isCpRo","hasMenu","menuLines","laborSale","laborCost","partsSale","partsCost","billHours","cpLaborSale","cpPartsSale","cpBillHours","wLaborSale","wPartsSale","wBillHours","iLaborSale","iPartsSale","iBillHours","oLaborSale","oPartsSale","oBillHours","menuLaborSale","menuPartsSale");
CREATE INDEX IF NOT EXISTS "RoFact_cover_opened_idx" ON "RoFact"("storeId","openDate")
  INCLUDE ("status","advisorId","isClosed","isCpRo","hasMenu","menuLines","laborSale","laborCost","partsSale","partsCost","billHours","cpLaborSale","cpPartsSale","cpBillHours","wLaborSale","wPartsSale","wBillHours","iLaborSale","iPartsSale","iBillHours","oLaborSale","oPartsSale","oBillHours","menuLaborSale","menuPartsSale");
