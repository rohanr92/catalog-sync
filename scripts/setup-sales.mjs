// Sales: adds the SaleLine table, the menu item and the order sync job (every 2 minutes).
import fs from 'node:fs';
const model = `
model SaleLine {
  id         String   @id
  channelKey String
  orderId    String
  lineId     String
  createdAt  DateTime
  state      String
  sku        String
  title      String   @default("")
  qty        Int
  refundQty  Int      @default(0)
  refundAmt  Float    @default(0)
  price      Float    @default(0)
  total      Float    @default(0)
  currency   String   @default("USD")
  updatedAt  DateTime @updatedAt

  @@index([channelKey, createdAt])
}
`;
const sql = `CREATE TABLE IF NOT EXISTS "SaleLine" (
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
`;
const edits = [
  ['components/Shell.tsx', [
    ['type LucideIcon }', 'TrendingUp as SalesIcon, type LucideIcon }'],
    ['      { href: "/upc-check"', '      { href: "/sales", label: "Sales", icon: SalesIcon, desc: "Units sold per style on each marketplace — best sellers, rising, falling, not selling" },\n      { href: "/upc-check"'],
  ]],
  ['instrumentation.ts', [
    ["  job('inventory', 60_000, async () => { const { inventoryTick } = await import('./lib/inventory-jobs'); await inventoryTick(); });\n",
     "  job('inventory', 60_000, async () => { const { inventoryTick } = await import('./lib/inventory-jobs'); await inventoryTick(); });\n  job('sales', 2 * 60_000, async () => { const { salesTick } = await import('./lib/sales'); await salesTick(); });\n"],
  ]],
];
const out = {};
for (const [file, reps] of edits) {
  if (!fs.existsSync(file)) { console.log(`STOPPED: ${file} not found`); process.exit(1); }
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of reps) {
    if (s.includes(b)) continue;
    const n = s.split(a).length - 1;
    if (n !== 1) { console.log(`STOPPED: ${file} — anchor found ${n} times: ${a.trim().slice(0, 70)}`); process.exit(1); }
    s = s.replace(a, () => b);
  }
  out[file] = s;
}
const schemaFile = 'prisma/schema.prisma';
if (!fs.existsSync(schemaFile)) { console.log('STOPPED: prisma/schema.prisma not found'); process.exit(1); }
const schema = fs.readFileSync(schemaFile, 'utf8');
for (const [file, s] of Object.entries(out)) { fs.copyFileSync(file, file + '.bak'); fs.writeFileSync(file, s); console.log('OK', file); }
if (!schema.includes('model SaleLine')) { fs.copyFileSync(schemaFile, schemaFile + '.bak'); fs.writeFileSync(schemaFile, schema.trimEnd() + '\n' + model); console.log('OK prisma/schema.prisma'); } else console.log('already done prisma/schema.prisma');
const dir = 'prisma/migrations/20261012150000_sales';
if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/migration.sql`, sql); console.log('OK', dir); } else console.log('already done', dir);
console.log('All done.');
