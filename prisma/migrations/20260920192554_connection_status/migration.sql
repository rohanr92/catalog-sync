-- AlterTable
ALTER TABLE "ChannelConnection" ADD COLUMN     "lastTestAt" TIMESTAMP(3),
ADD COLUMN     "lastTestMsg" TEXT,
ADD COLUMN     "lastTestOk" BOOLEAN;
