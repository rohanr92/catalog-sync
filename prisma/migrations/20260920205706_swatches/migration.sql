-- CreateTable
CREATE TABLE "Swatch" (
    "id" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Swatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Swatch_styleCode_color_key" ON "Swatch"("styleCode", "color");
