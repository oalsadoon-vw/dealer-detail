-- CreateTable
CREATE TABLE "GlAccountDaily" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "glAccountId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "department" TEXT,
    "fsGroup" TEXT,
    "fsLine" TEXT,
    "fsPage" INTEGER,
    "mtd" DOUBLE PRECISION NOT NULL,
    "ytd" DOUBLE PRECISION NOT NULL,
    "mtdCount" INTEGER NOT NULL DEFAULT 0,
    "daily" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "GlAccountDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GlAccountDaily_storeId_asOfDate_idx" ON "GlAccountDaily"("storeId", "asOfDate");

-- CreateIndex
CREATE INDEX "GlAccountDaily_storeId_department_accountType_idx" ON "GlAccountDaily"("storeId", "department", "accountType");

-- CreateIndex
CREATE UNIQUE INDEX "GlAccountDaily_storeId_asOfDate_glAccountId_key" ON "GlAccountDaily"("storeId", "asOfDate", "glAccountId");

-- AddForeignKey
ALTER TABLE "GlAccountDaily" ADD CONSTRAINT "GlAccountDaily_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS (matches RoFact pattern)
ALTER TABLE "GlAccountDaily" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gl_account_daily_select" ON public."GlAccountDaily"
  FOR SELECT TO authenticated
  USING ("storeId" IN (SELECT private.user_store_ids()));
