-- CreateTable
CREATE TABLE "IgnoredItem" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "size" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgnoredItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IgnoredItem_channelKey_idx" ON "IgnoredItem"("channelKey");

-- CreateIndex
CREATE UNIQUE INDEX "IgnoredItem_channelKey_gtin_key" ON "IgnoredItem"("channelKey", "gtin");
