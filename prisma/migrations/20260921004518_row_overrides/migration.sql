-- CreateTable
CREATE TABLE "RowOverride" (
    "changeId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RowOverride_pkey" PRIMARY KEY ("changeId")
);
