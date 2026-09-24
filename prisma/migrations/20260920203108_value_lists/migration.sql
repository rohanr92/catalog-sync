-- CreateTable
CREATE TABLE "ValueList" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "values" JSONB NOT NULL,

    CONSTRAINT "ValueList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColumnSpec" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "example" TEXT,
    "requiredBy" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ColumnSpec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ValueList_channelKey_attribute_key" ON "ValueList"("channelKey", "attribute");

-- CreateIndex
CREATE UNIQUE INDEX "ColumnSpec_channelKey_code_key" ON "ColumnSpec"("channelKey", "code");
