// Usage: node scripts/check-offer.mjs <UPC> <SKU> [channel]
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const UPC = process.argv[2] || '810205995175', SKU = (process.argv[3] || 'LUCRECIA-CH-37').toLowerCase(), CH = process.argv[4] || 'nordstrom';
const norm = (u) => String(u ?? '').replace(/\D/g, '').replace(/^0+/, '');
const snap = (await db.setting.findUnique({ where: { key: `inv:${CH}` } }))?.value ?? {};
console.log(`\n${CH} offers pulled at: ${snap.pulledAt} | error: ${snap.error ?? 'none'} | limited until: ${snap.limitedUntil ?? '-'} | offers: ${(snap.items ?? []).length}`);
console.log('\nOffers with this SKU or UPC:');
for (const i of (snap.items ?? []).filter((i) => String(i.sku ?? '').toLowerCase() === SKU || norm(i.upc) === norm(UPC))) console.log('  ', JSON.stringify(i));
const all = await db.product.findMany({ select: { gtin: true, sku: true, attrs: true, color: true } });
console.log('\nNordstrom products with this UPC or SKU:');
for (const p of all) {
  const a = p.attrs ?? {};
  if (norm(p.gtin) === norm(UPC) || String(p.sku ?? '').toLowerCase() === SKU || String(a['shop-sku'] ?? '').toLowerCase() === SKU)
    console.log('   UPC', p.gtin, '| sku', p.sku, '| shop-sku', a['shop-sku'] ?? '-', '| size', a['size-description'] ?? '-', '|', p.color);
}
await db.$disconnect();
