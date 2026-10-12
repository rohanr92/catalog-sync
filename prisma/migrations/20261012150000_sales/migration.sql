CREATE TABLE IF NOT EXISTS "SaleLine" (
  "id" TEXT NOT NULL,
  "channelKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "lineId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "state" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "qty" INTEGER NOT NULL,
  "refundQty" INTEGER NOT NULL DEFAULT 0,
  "refundAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SaleLine_channelKey_createdAt_idx" ON "SaleLine"("channelKey", "createdAt");
