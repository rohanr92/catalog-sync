-- AlterTable
ALTER TABLE "ImageChange" ADD COLUMN     "sendError" TEXT,
ADD COLUMN     "sendStatus" TEXT,
ADD COLUMN     "submissionId" TEXT;

-- AlterTable
ALTER TABLE "PendingChange" ADD COLUMN     "sendError" TEXT,
ADD COLUMN     "sendStatus" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "accepted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "channelKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'listing',
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "rejected" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reportFile" TEXT,
ADD COLUMN     "reportName" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "statusDetail" TEXT;
