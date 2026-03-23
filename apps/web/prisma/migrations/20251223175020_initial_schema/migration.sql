-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "timezone" TEXT,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advisor" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "nameRaw" TEXT,

    CONSTRAINT "Advisor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "warnings" JSONB,
    "errors" JSONB,
    "summary" JSONB,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestedFile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "byteSize" INTEGER,
    "detectedType" TEXT,
    "detectionConfidence" DOUBLE PRECISION,
    "rawMeta" JSONB,
    "parseWarnings" JSONB,
    "parseErrors" JSONB,

    CONSTRAINT "IngestedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawReportRow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ingestedFileId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "rowHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "RawReportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorDailyMetrics" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "openRos" INTEGER NOT NULL DEFAULT 0,
    "menuCount" INTEGER NOT NULL DEFAULT 0,
    "menuLaborGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "menuPartsGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alaCount" INTEGER NOT NULL DEFAULT 0,
    "alaLaborGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alaPartsGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recCount" INTEGER NOT NULL DEFAULT 0,
    "recSoldCount" INTEGER NOT NULL DEFAULT 0,
    "recAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recSoldAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyLaborGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyPartsGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meta" JSONB,

    CONSTRAINT "AdvisorDailyMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorDailyCommodity" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "commodityKey" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meta" JSONB,

    CONSTRAINT "AdvisorDailyCommodity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Advisor_storeId_idx" ON "Advisor"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Advisor_storeId_nameNormalized_key" ON "Advisor"("storeId", "nameNormalized");

-- CreateIndex
CREATE INDEX "IngestionRun_storeId_businessDate_idx" ON "IngestionRun"("storeId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionRun_storeId_businessDate_key" ON "IngestionRun"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "IngestedFile_runId_idx" ON "IngestedFile"("runId");

-- CreateIndex
CREATE INDEX "IngestedFile_storeId_businessDate_idx" ON "IngestedFile"("storeId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "IngestedFile_runId_sha256_key" ON "IngestedFile"("runId", "sha256");

-- CreateIndex
CREATE INDEX "RawReportRow_storeId_businessDate_idx" ON "RawReportRow"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "RawReportRow_ingestedFileId_idx" ON "RawReportRow"("ingestedFileId");

-- CreateIndex
CREATE INDEX "RawReportRow_rowHash_idx" ON "RawReportRow"("rowHash");

-- CreateIndex
CREATE UNIQUE INDEX "RawReportRow_ingestedFileId_rowIndex_key" ON "RawReportRow"("ingestedFileId", "rowIndex");

-- CreateIndex
CREATE INDEX "AdvisorDailyMetrics_storeId_businessDate_idx" ON "AdvisorDailyMetrics"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "AdvisorDailyMetrics_storeId_advisorId_businessDate_idx" ON "AdvisorDailyMetrics"("storeId", "advisorId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorDailyMetrics_storeId_advisorId_businessDate_key" ON "AdvisorDailyMetrics"("storeId", "advisorId", "businessDate");

-- CreateIndex
CREATE INDEX "AdvisorDailyCommodity_storeId_businessDate_idx" ON "AdvisorDailyCommodity"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "AdvisorDailyCommodity_storeId_advisorId_businessDate_idx" ON "AdvisorDailyCommodity"("storeId", "advisorId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorDailyCommodity_storeId_advisorId_businessDate_commod_key" ON "AdvisorDailyCommodity"("storeId", "advisorId", "businessDate", "commodityKey");

-- AddForeignKey
ALTER TABLE "Advisor" ADD CONSTRAINT "Advisor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestedFile" ADD CONSTRAINT "IngestedFile_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestedFile" ADD CONSTRAINT "IngestedFile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawReportRow" ADD CONSTRAINT "RawReportRow_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawReportRow" ADD CONSTRAINT "RawReportRow_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawReportRow" ADD CONSTRAINT "RawReportRow_ingestedFileId_fkey" FOREIGN KEY ("ingestedFileId") REFERENCES "IngestedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorDailyMetrics" ADD CONSTRAINT "AdvisorDailyMetrics_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorDailyMetrics" ADD CONSTRAINT "AdvisorDailyMetrics_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "Advisor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorDailyCommodity" ADD CONSTRAINT "AdvisorDailyCommodity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorDailyCommodity" ADD CONSTRAINT "AdvisorDailyCommodity_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "Advisor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
