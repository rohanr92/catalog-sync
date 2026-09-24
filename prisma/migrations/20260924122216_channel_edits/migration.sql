-- CreateTable
CREATE TABLE "ChannelEdit" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "upcs" JSONB NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "fields" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submissionId" TEXT,
    "sendError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelEdit_channelKey_status_idx" ON "ChannelEdit"("channelKey", "status");
