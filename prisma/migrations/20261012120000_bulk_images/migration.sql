-- Bulk images (new tables only)
CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BulkJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BulkJob_channelKey_idx" ON "BulkJob"("channelKey");

CREATE TABLE "BulkImage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "data" BYTEA,
    "flag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "resultUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BulkImage_jobId_idx" ON "BulkImage"("jobId");
CREATE INDEX "BulkImage_channelKey_status_idx" ON "BulkImage"("channelKey", "status");
CREATE INDEX "BulkImage_channelKey_groupKey_idx" ON "BulkImage"("channelKey", "groupKey");
