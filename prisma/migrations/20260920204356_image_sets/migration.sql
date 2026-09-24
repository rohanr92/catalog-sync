-- CreateTable
CREATE TABLE "ImageSet" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "images" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageSet_channelKey_styleCode_color_key" ON "ImageSet"("channelKey", "styleCode", "color");
