-- CreateTable
CREATE TABLE "NordstromEdit" (
    "id" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "gtins" JSONB NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "fields" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submissionId" TEXT,
    "sendError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NordstromEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NordstromEdit_status_idx" ON "NordstromEdit"("status");
