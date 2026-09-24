-- CreateTable
CREATE TABLE "ChannelProduct" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "channelSku" TEXT,
    "styleCode" TEXT,
    "color" TEXT,
    "size" TEXT,
    "category" TEXT,
    "title" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "swatchUrl" TEXT,
    "raw" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ChannelProduct_channelKey_styleCode_idx" ON "ChannelProduct"("channelKey", "styleCode");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelProduct_channelKey_upc_key" ON "ChannelProduct"("channelKey", "upc");
