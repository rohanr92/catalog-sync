-- CreateTable
CREATE TABLE "SizeMap" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "styleCode" TEXT,
    "sourceSize" TEXT NOT NULL,
    "targetSize" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizeMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SizeMap_channelKey_styleCode_sourceSize_key" ON "SizeMap"("channelKey", "styleCode", "sourceSize");
