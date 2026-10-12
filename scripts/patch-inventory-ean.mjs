import fs from 'node:fs';
const F = 'lib/inventory.ts';
let s = fs.readFileSync(F, 'utf8');
if (s.includes('productRefs(')) { console.log('Already done.'); process.exit(0); }

const edits = [
  // 1. catalogue lookup: every SKU-like column of the imported marketplace catalogue (e.g. Debenhams product_id → ean)
  [`import { log } from './log';\n`, `import { log } from './log';\nimport { channelColumns } from './channel-specs';\n`],
  [`  const cps = await db.channelProduct.findMany({ where: { channelKey: ch }, select: { upc: true, channelSku: true } });
  for (const c of cps) if (c.channelSku) m.set(c.channelSku.toLowerCase(), normUpc(c.upc));`,
   `  const spec = channelColumns[ch];
  const cols = [spec?.sku, spec?.altUpc, 'product_id', 'shop_sku', 'shopSku', 'sku', 'SHOP_SKU', 'uid_code'].filter(Boolean) as string[];
  const cps = await db.channelProduct.findMany({ where: { channelKey: ch }, select: { upc: true, channelSku: true, raw: true } });
  for (const c of cps) {
    const u = normUpc(c.upc);
    if (!u) continue;
    const raw = (c.raw ?? {}) as Record<string, string>;
    for (const s of [c.channelSku, ...cols.map((k) => raw[k])]) if (s && String(s).trim()) m.set(String(s).trim().toLowerCase(), u);
  }`],
  // 2. look the offer up by its offer SKU and by its product SKU / product id
  [`  const make = (sku: string, upcFromOffer: string, weak: string, extra: Partial<SnapItem>): SnapItem => {
    const u = normUpc(upcFromOffer);
    const viaCat = !u ? bySku.get(sku.toLowerCase()) ?? '' : '';`,
   `  const make = (sku: string, upcFromOffer: string, weak: string, extra: Partial<SnapItem>, alts: string[] = []): SnapItem => {
    const u = normUpc(upcFromOffer);
    const viaCat = !u ? [sku, ...alts].map((x) => bySku.get(String(x ?? '').trim().toLowerCase())).find(Boolean) ?? '' : '';`],
  [`        items.push(make(sku, fromOffer, upcIn(sku) || upcIn(r['product-id']), { qty: Number(r['quantity'] ?? 0), price: r['price'] ? Number(r['price']) : null, title: r['product-title'], state: r['state-code'] }));`,
   `        items.push(make(sku, fromOffer, upcIn(sku) || upcIn(r['product-id']), { qty: Number(r['quantity'] ?? 0), price: r['price'] ? Number(r['price']) : null, title: r['product-title'], state: r['state-code'], pid: r['product-sku'] || r['product-id'] }, [r['product-sku'], r['product-id']]));`],
  [`        return make(o.shop_sku, fromOffer, upcIn(o.shop_sku), { qty: Number(o.quantity ?? 0), price: o.price == null ? null : Number(o.price), title: o.product_title, state: o.state_code });`,
   `        return make(o.shop_sku, fromOffer, upcIn(o.shop_sku), { qty: Number(o.quantity ?? 0), price: o.price == null ? null : Number(o.price), title: o.product_title, state: o.state_code, pid: o.product_sku }, [o.product_sku ?? '']);`],
  // 3. still no UPC: ask the marketplace for the product's EAN/UPC (P31), remembered so it is asked only once
  [`    await saveSnap(ch, { pulledAt: new Date().toISOString(), error: null, items });
    return { count: items.length, unmatched: items.filter((i) => !i.upc).length };
  } catch (e) {
    if (e instanceof Limited) {`,
   `    await productRefs(ch, base, key, shopQ, items);
    await saveSnap(ch, { pulledAt: new Date().toISOString(), error: null, items });
    return { count: items.length, unmatched: items.filter((i) => !i.upc).length };
  } catch (e) {
    if (e instanceof Limited) {`],
  [`// ---------- Shopify (barcode = UPC) ----------`,
   `// P31 — the marketplace's own product record holds the EAN/UPC. Asked only for offers still without one.
async function productRefs(ch: string, base: string, key: string, shopQ: string, items: SnapItem[]) {
  const cacheKey = \`invRef:\${ch}\`;
  const cache = await getSetting<Record<string, string>>(cacheKey, {});
  for (const it of items) if (!it.upc && cache[it.sku]) { it.upc = cache[it.sku]; it.via = 'catalog'; }
  const todo = items.filter((i) => !i.upc && !(i.sku in cache));
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100);
    for (const type of ['SHOP_SKU', 'SKU']) {
      const left = batch.filter((b) => !b.upc);
      if (!left.length) break;
      const ids = left.map((b) => (type === 'SKU' ? b.pid || b.sku : b.sku)).join(',');
      let res: Response;
      try { res = await miraklGet(\`\${base}/api/products?product_ids=\${encodeURIComponent(ids)}&product_id_type=\${type}\${shopQ ? \`&\${shopQ}\` : ''}\`, key); } catch { return; }
      if (!res.ok) continue;
      const products: { product_sku?: string; product_id?: string; product_references?: { reference: string; reference_type: string }[] }[] = (await res.json()).products ?? [];
      for (const p of products) {
        const ref = (p.product_references ?? []).find((x) => /ean|upc|gtin/i.test(x.reference_type))?.reference ?? (p.product_references ?? []).map((x) => upcIn(x.reference)).find(Boolean);
        const u = normUpc(ref);
        if (!u) continue;
        for (const b of left) if ([b.sku, b.pid].includes(p.product_id) || [b.sku, b.pid].includes(p.product_sku)) { b.upc = u; b.via = 'catalog'; }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    for (const b of batch) cache[b.sku] = b.upc; // '' = asked, none found
  }
  await setSetting(cacheKey, cache);
}

// ---------- Shopify (barcode = UPC) ----------`],
  [`export interface SnapItem { upc: string; sku: string; qty: number; price: number | null; title?: string; state?: string; via?: 'upc' | 'catalog' | ''; status?: string }`,
   `export interface SnapItem { upc: string; sku: string; qty: number; price: number | null; title?: string; state?: string; via?: 'upc' | 'catalog' | ''; status?: string; pid?: string }`],
];

const bad = edits.map(([a], i) => (s.split(a).length === 2 ? -1 : i)).filter((i) => i >= 0);
if (bad.length) { console.log('STOPPED - nothing changed. Not found: part ' + bad.join(', ')); process.exit(1); }
fs.writeFileSync(F + '.bak', s);
for (const [a, b] of edits) s = s.replace(a, () => b);
fs.writeFileSync(F, s);
console.log('OK - EAN/UPC now also comes from the marketplace catalogue (all SKU columns) and the marketplace itself');
