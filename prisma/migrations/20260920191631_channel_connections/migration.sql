-- CreateTable
CREATE TABLE "ChannelConnection" (
    "channelKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiUrl" TEXT,
    "apiKey" TEXT,
    "shopId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("channelKey")
);
