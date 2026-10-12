import fs from 'node:fs';
const LIB = 'lib/inventory.ts', PAGE = 'app/inventory/page.tsx';
let s = fs.readFileSync(LIB, 'utf8'), p = fs.readFileSync(PAGE, 'utf8');
if (s.includes('include_inactive_offers')) { console.log('Already done.'); process.exit(0); }

const libEdits = [
  // 1. ask Mirakl for out-of-stock / inactive offers too
  ["const ex = await miraklGet(`${base}/api/offers/export${shopQ ? `?${shopQ}` : ''}`, key, 'text/csv, */*');",
   "const ex = await miraklGet(`${base}/api/offers/export?include_inactive_offers=true${shopQ ? `&${shopQ}` : ''}`, key, 'text/csv, */*');"],
  // 2. a product in that marketplace's catalogue with no offer back = 0 in stock there (not "missing")
  ["export interface Cell { qty: number; price: number | null; sku: string; want: number | null; state: 'ok' | 'diff' | 'no-shopify'; via: Via }",
   "export interface Cell { qty: number; price: number | null; sku: string; want: number | null; state: 'ok' | 'diff' | 'no-shopify'; via: Via; inactive?: boolean }"],
  ["  const upcs = new Set<string>(); for (const c of marketplaces) for (const u of index[c].keys()) upcs.add(u);",
   `  const listed: Record<string, Map<string, string>> = {};
  for (const c of marketplaces) {
    listed[c] = new Map();
    if (c === 'nordstrom') for (const p of await db.product.findMany({ select: { gtin: true, sku: true } })) { const u = normUpc(p.gtin); if (u) listed[c].set(u, p.sku ?? ''); }
    else for (const cp of await db.channelProduct.findMany({ where: { channelKey: c }, select: { upc: true, channelSku: true } })) { const u = normUpc(cp.upc); if (u) listed[c].set(u, cp.channelSku ?? ''); }
  }
  const upcs = new Set<string>(); for (const c of marketplaces) { for (const u of index[c].keys()) upcs.add(u); for (const u of listed[c].keys()) upcs.add(u); }`],
  [`      const x = index[c].get(upc);
      if (!x) { cells[c] = null; continue; }
      const want = shop ? Math.max(0, shop.qty - (cfg.buffers[c] ?? 0)) : null;`,
   `      const x = index[c].get(upc) ?? (listed[c].has(upc) ? { it: { upc, sku: listed[c].get(upc) ?? '', qty: 0, price: null } as SnapItem, via: 'catalog' as Via, inactive: true } : null);
      if (!x) { cells[c] = null; continue; }
      const want = shop ? Math.max(0, shop.qty - (cfg.buffers[c] ?? 0)) : null;`],
  ["      cells[c] = { qty: x.it.qty, price: x.it.price, sku: x.it.sku, want, state, via: x.via };",
   "      cells[c] = { qty: x.it.qty, price: x.it.price, sku: x.it.sku, want, state, via: x.via, inactive: 'inactive' in x ? true : undefined };"],
];
const pageEdits = [
  ["interface Cell { qty: number; price: number | null; sku: string; want: number | null; state: 'ok' | 'diff' | 'no-shopify'; via: Via }",
   "interface Cell { qty: number; price: number | null; sku: string; want: number | null; state: 'ok' | 'diff' | 'no-shopify'; via: Via; inactive?: boolean }"],
  ["                        {viaText[x.via] && <span className=\"iv-tag via\">{viaText[x.via]}</span>}",
   "                        {x.inactive ? <span className=\"iv-tag none\" title=\"Listed on this marketplace, but its offer is out of stock / inactive\">out of stock</span> : viaText[x.via] && <span className=\"iv-tag via\">{viaText[x.via]}</span>}"],
];
const bad = [...libEdits.map(([a], i) => (s.split(a).length === 2 ? -1 : `lib ${i}`)), ...pageEdits.map(([a], i) => (p.split(a).length === 2 ? -1 : `page ${i}`))].filter((x) => x !== -1);
if (bad.length) { console.log('STOPPED - nothing changed. Not found: ' + bad.join(', ')); process.exit(1); }
for (const [a, b] of libEdits) s = s.replace(a, () => b);
for (const [a, b] of pageEdits) p = p.replace(a, () => b);
fs.writeFileSync(LIB, s); fs.writeFileSync(PAGE, p);
console.log('OK - out-of-stock offers are pulled too, and listed products with no offer show 0 / out of stock');
