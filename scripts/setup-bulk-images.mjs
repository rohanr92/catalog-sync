import fs from 'node:fs';

// 1. Two new tables in the Prisma schema
const SCHEMA = 'prisma/schema.prisma';
let schema = fs.readFileSync(SCHEMA, 'utf8');
if (!schema.includes('model BulkImage')) {
  schema += `
model BulkJob {
  id         String   @id @default(cuid())
  channelKey String
  width      Int
  height     Int
  status     String   @default("running") // running | done
  total      Int      @default(0)
  done       Int      @default(0)
  failed     Int      @default(0)
  createdAt  DateTime @default(now())

  @@index([channelKey])
}

model BulkImage {
  id         String   @id @default(cuid())
  jobId      String
  channelKey String
  groupKey   String
  styleCode  String
  color      String
  title      String   @default("")
  position   Int
  sourceUrl  String   @db.Text
  data       Bytes?   // small preview only; the full size is made again on approval
  flag       String?
  status     String   @default("queued") // queued | ready | failed | approved | applied | rejected | manual
  error      String?  @db.Text
  resultUrl  String?  @db.Text
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([jobId])
  @@index([channelKey, status])
  @@index([channelKey, groupKey])
}
`;
  fs.writeFileSync(SCHEMA, schema);
  console.log('OK - schema: BulkJob + BulkImage added');
} else console.log('Already in schema');

// 2. The migration (only creates the two new tables — nothing existing is touched)
const DIR = 'prisma/migrations/20261012120000_bulk_images';
if (!fs.existsSync(DIR)) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(`${DIR}/migration.sql`, `-- Bulk images (new tables only)
CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BulkJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BulkJob_channelKey_idx" ON "BulkJob"("channelKey");

CREATE TABLE "BulkImage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "data" BYTEA,
    "flag" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "resultUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BulkImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BulkImage_jobId_idx" ON "BulkImage"("jobId");
CREATE INDEX "BulkImage_channelKey_status_idx" ON "BulkImage"("channelKey", "status");
CREATE INDEX "BulkImage_channelKey_groupKey_idx" ON "BulkImage"("channelKey", "groupKey");
`);
  console.log('OK - migration file written');
} else console.log('Migration already there');

// 3. Menu item under Marketplaces
const SHELL = 'components/Shell.tsx';
let shell = fs.readFileSync(SHELL, 'utf8');
if (!shell.includes('/bulk-images')) {
  const a = 'type LucideIcon }', b = '      { href: "/upc-check"';
  if (shell.split(a).length !== 2 || shell.split(b).length !== 2) { console.log('STOPPED - menu not changed'); process.exit(1); }
  shell = shell.replace(a, () => 'ImagePlus, type LucideIcon }');
  shell = shell.replace(b, () => '      { href: "/bulk-images", label: "Bulk images", icon: ImagePlus, desc: "Resize + extend background for every new product, then approve" },\n' + b);
  fs.writeFileSync(SHELL, shell);
  console.log('OK - Bulk images added to the menu');
} else console.log('Menu already has Bulk images');
