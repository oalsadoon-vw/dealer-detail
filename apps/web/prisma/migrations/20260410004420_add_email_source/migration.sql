-- CreateTable
CREATE TABLE "EmailSource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storeId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "subjectPattern" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastProcessedAt" TIMESTAMP(3),

    CONSTRAINT "EmailSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSource_senderEmail_idx" ON "EmailSource"("senderEmail");

-- CreateIndex
CREATE INDEX "EmailSource_storeId_idx" ON "EmailSource"("storeId");

-- AddForeignKey
ALTER TABLE "EmailSource" ADD CONSTRAINT "EmailSource_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
