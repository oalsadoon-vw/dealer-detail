-- AlterTable
ALTER TABLE "RawRepairOrder" ADD COLUMN     "sourceModifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RoFact" (
    "id" TEXT NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "status" TEXT,
    "roType" TEXT,
    "advisorId" TEXT,
    "advisorTekionId" TEXT,
    "openDate" TIMESTAMP(3) NOT NULL,
    "closeDate" TIMESTAMP(3),
    "openTs" TIMESTAMP(3) NOT NULL,
    "closeTs" TIMESTAMP(3),
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "vin" TEXT,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "mileage" INTEGER,
    "jobCount" INTEGER NOT NULL DEFAULT 0,
    "opCount" INTEGER NOT NULL DEFAULT 0,
    "laborSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partsSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpLaborSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpPartsSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpBillHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wLaborSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wPartsSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wBillHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iLaborSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iPartsSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iBillHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oLaborSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oPartsSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oBillHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasMenu" BOOLEAN NOT NULL DEFAULT false,
    "menuLines" INTEGER NOT NULL DEFAULT 0,
    "menuLaborSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "menuPartsSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasAla" BOOLEAN NOT NULL DEFAULT false,
    "isCpRo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoOpFact" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "roFactId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "advisorId" TEXT,
    "openDate" TIMESTAMP(3) NOT NULL,
    "closeDate" TIMESTAMP(3),
    "jobNumber" TEXT,
    "jobStatus" TEXT,
    "payType" TEXT,
    "subPayType" TEXT,
    "payClass" TEXT NOT NULL,
    "opcode" TEXT NOT NULL,
    "opcodeDesc" TEXT,
    "category" TEXT NOT NULL,
    "commodityKey" TEXT,
    "isMenu" BOOLEAN NOT NULL DEFAULT false,
    "laborSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partsSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "partsQty" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "RoOpFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoFact_storeId_openDate_idx" ON "RoFact"("storeId", "openDate");

-- CreateIndex
CREATE INDEX "RoFact_storeId_closeDate_idx" ON "RoFact"("storeId", "closeDate");

-- CreateIndex
CREATE INDEX "RoFact_storeId_advisorId_closeDate_idx" ON "RoFact"("storeId", "advisorId", "closeDate");

-- CreateIndex
CREATE INDEX "RoFact_storeId_advisorId_openDate_idx" ON "RoFact"("storeId", "advisorId", "openDate");

-- CreateIndex
CREATE UNIQUE INDEX "RoFact_storeId_documentId_key" ON "RoFact"("storeId", "documentId");

-- CreateIndex
CREATE INDEX "RoOpFact_storeId_closeDate_idx" ON "RoOpFact"("storeId", "closeDate");

-- CreateIndex
CREATE INDEX "RoOpFact_storeId_openDate_idx" ON "RoOpFact"("storeId", "openDate");

-- CreateIndex
CREATE INDEX "RoOpFact_storeId_opcode_idx" ON "RoOpFact"("storeId", "opcode");

-- CreateIndex
CREATE INDEX "RoOpFact_storeId_category_closeDate_idx" ON "RoOpFact"("storeId", "category", "closeDate");

-- CreateIndex
CREATE INDEX "RoOpFact_roFactId_idx" ON "RoOpFact"("roFactId");

-- AddForeignKey
ALTER TABLE "RoFact" ADD CONSTRAINT "RoFact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoFact" ADD CONSTRAINT "RoFact_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "Advisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoOpFact" ADD CONSTRAINT "RoOpFact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoOpFact" ADD CONSTRAINT "RoOpFact_roFactId_fkey" FOREIGN KEY ("roFactId") REFERENCES "RoFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoOpFact" ADD CONSTRAINT "RoOpFact_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "Advisor"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS parity with the other store-scoped tables (app reads via service role +
-- its own authz; these policies are defense-in-depth for PostgREST/authenticated).
ALTER TABLE "RoFact"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoOpFact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ro_fact_select" ON public."RoFact"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));
CREATE POLICY "ro_op_fact_select" ON public."RoOpFact"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));
