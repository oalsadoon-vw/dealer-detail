-- AlterTable
ALTER TABLE "Advisor" ADD COLUMN     "tekionUserId" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "apiSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tekionDealerId" TEXT;

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "cursor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "apiCallCount" INTEGER NOT NULL DEFAULT 0,
    "rosFetched" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "errors" JSONB,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawRepairOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "syncRunId" TEXT,
    "documentId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "status" TEXT,
    "payType" TEXT,
    "advisorTekionId" TEXT,
    "vin" TEXT,
    "openDate" TIMESTAMP(3),
    "closeDate" TIMESTAMP(3),
    "businessDate" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "RawRepairOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcodeCategory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT,
    "opcode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "commodityKey" TEXT,

    CONSTRAINT "OpcodeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncRun_storeId_windowStart_idx" ON "SyncRun"("storeId", "windowStart");

-- CreateIndex
CREATE INDEX "SyncRun_storeId_status_idx" ON "SyncRun"("storeId", "status");

-- CreateIndex
CREATE INDEX "RawRepairOrder_storeId_businessDate_idx" ON "RawRepairOrder"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "RawRepairOrder_syncRunId_idx" ON "RawRepairOrder"("syncRunId");

-- CreateIndex
CREATE UNIQUE INDEX "RawRepairOrder_storeId_documentId_key" ON "RawRepairOrder"("storeId", "documentId");

-- CreateIndex
CREATE INDEX "OpcodeCategory_category_idx" ON "OpcodeCategory"("category");

-- CreateIndex
CREATE UNIQUE INDEX "OpcodeCategory_storeId_opcode_key" ON "OpcodeCategory"("storeId", "opcode");

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRepairOrder" ADD CONSTRAINT "RawRepairOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRepairOrder" ADD CONSTRAINT "RawRepairOrder_syncRunId_fkey" FOREIGN KEY ("syncRunId") REFERENCES "SyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcodeCategory" ADD CONSTRAINT "OpcodeCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
