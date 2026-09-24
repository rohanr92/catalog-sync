-- CreateTable
CREATE TABLE "AttributeMap" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "nordstromCode" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'learned',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttrValueMap" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "channelCode" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL,
    "toValue" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'learned',

    CONSTRAINT "AttrValueMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryDefault" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "share" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CategoryDefault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttributeMap_channelKey_channelCode_key" ON "AttributeMap"("channelKey", "channelCode");

-- CreateIndex
CREATE UNIQUE INDEX "AttrValueMap_channelKey_channelCode_fromValue_key" ON "AttrValueMap"("channelKey", "channelCode", "fromValue");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryDefault_channelKey_category_code_key" ON "CategoryDefault"("channelKey", "category", "code");
