-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT NOT NULL,
    "color" TEXT,
    "material" TEXT,
    "categoryRaw" TEXT,
    "attrs" JSONB NOT NULL DEFAULT '{}',
    "sourceChannel" TEXT NOT NULL DEFAULT 'nordstrom',
    "contentHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'alt',
    "sourceUrl" TEXT NOT NULL,
    "storedUrl" TEXT,
    "contentHash" TEXT NOT NULL,
    "perceptualHash" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "altText" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelImage" (
    "id" TEXT NOT NULL,
    "productImageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'inherit',
    "url" TEXT,
    "position" INTEGER NOT NULL,
    "specVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "blockedReason" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSource" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imageSpec" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MappingProfile" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MappingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValueMap" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "fromValue" TEXT NOT NULL,
    "toValue" TEXT NOT NULL,

    CONSTRAINT "ValueMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMap" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "fromCategory" TEXT NOT NULL,
    "toCategory" TEXT NOT NULL,
    "toCategoryId" TEXT,
    "requiredAttrs" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "CategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingChange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "fieldDiffs" JSONB NOT NULL DEFAULT '[]',
    "outputRow" JSONB NOT NULL DEFAULT '{}',
    "validation" TEXT NOT NULL DEFAULT 'pending',
    "blockedReason" TEXT,
    "approval" TEXT NOT NULL DEFAULT 'pending',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "submissionId" TEXT,

    CONSTRAINT "PendingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelListing" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'not_listed',
    "offerId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lockedFields" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ChannelListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "importId" TEXT,
    "fileUrl" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorReport" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_gtin_key" ON "Product"("gtin");

-- CreateIndex
CREATE INDEX "Product_contentHash_idx" ON "Product"("contentHash");

-- CreateIndex
CREATE INDEX "Snapshot_productId_pulledAt_idx" ON "Snapshot"("productId", "pulledAt");

-- CreateIndex
CREATE INDEX "ProductImage_contentHash_idx" ON "ProductImage"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_productId_position_key" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelImage_productImageId_channelId_key" ON "ChannelImage"("productImageId", "channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_key_key" ON "Channel"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MappingProfile_channelId_version_key" ON "MappingProfile"("channelId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ValueMap_channelId_attribute_fromValue_key" ON "ValueMap"("channelId", "attribute", "fromValue");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMap_channelId_fromCategory_key" ON "CategoryMap"("channelId", "fromCategory");

-- CreateIndex
CREATE INDEX "PendingChange_channelId_approval_validation_idx" ON "PendingChange"("channelId", "approval", "validation");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelListing_productId_channelId_key" ON "ChannelListing"("productId", "channelId");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelImage" ADD CONSTRAINT "ChannelImage_productImageId_fkey" FOREIGN KEY ("productImageId") REFERENCES "ProductImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelImage" ADD CONSTRAINT "ChannelImage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingProfile" ADD CONSTRAINT "MappingProfile_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValueMap" ADD CONSTRAINT "ValueMap_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMap" ADD CONSTRAINT "CategoryMap_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingChange" ADD CONSTRAINT "PendingChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingChange" ADD CONSTRAINT "PendingChange_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingChange" ADD CONSTRAINT "PendingChange_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelListing" ADD CONSTRAINT "ChannelListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelListing" ADD CONSTRAINT "ChannelListing_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
