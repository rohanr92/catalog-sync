-- AlterTable
ALTER TABLE "ImportRun" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "PendingChange" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "ImageChange" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "gtins" JSONB NOT NULL,
    "positions" JSONB NOT NULL,
    "oldImages" JSONB NOT NULL,
    "newImages" JSONB NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ImageChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageChange_channelKey_status_idx" ON "ImageChange"("channelKey", "status");
