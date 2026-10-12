import { db } from './db';
import { log } from './log';
import { channelColumns } from './channel-specs';

// Inventory: Shopify vs every Mirakl marketplace (Nordstrom included).
// Matching is by UPC: Shopify barcode ↔ the marketplace offer's UPC/EAN. Leading zeros are ignored.
// Only for offers with no UPC you can map them by SKU (per offer, or "same SKU as Shopify" per marketplace).

export interface InvCfg { buffers: Record<string, number>; autoMinutes?: number; orderTrigger?: boolean; orderDelay?: number }
export interface SnapItem { upc: string; sku: string; qty: number; price: number | null; title?: string; state?: string; via?: 'upc' | 'catalog' | ''; status?: string; pid?: string }
export interface Snap { pulledAt: string | null; error: string | null; items: SnapItem[]; limitedUntil?: string }
export interface PushLog { id: string; sku: string; from: number; to: number; at: string; status: string; ok?: number; failed?: number }
export interface SkuMap { skuMode: boolean; map: Record<string, string> } // offer SKU → Shopify barcode or Shopify SKU

const NAMES: Record<string, string> = { shopify: 'Shopify', nordstrom: 'Nordstrom', macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus' };
export const nameOf = (k: string) => NAMES[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
export const normUpc = (u: unknown) => { const d = String(u ?? '').replace(/\D/g, '').replace(/^0+/, ''); return d.length >= 8 ? d : ''; };

async function getSetting<T>(key: string, d: T): Promise<T> { return ((await db.setting.findUnique({ where: { key } }))?.value as unknown as T) ?? d; }
async function setSetting(key: string, value: unknown) { await db.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } }); }

export const getCfg = async (): Promise<InvCfg> => ({ buffers: {}, ...(await getSetting<Partial<InvCfg>>('inventory', {})) });
export const saveCfg = (c: InvCfg) => setSetting('inventory', c);
export const getSnap = (k: string) => getSetting<Snap>(`inv:${k}`, { pulledAt: null, error: null, items: [] });
const saveSnap = (k: string, s: Snap) => setSetting(`inv:${k}`, s);
export const getPushes = (k: string) => getSetting<PushLog[]>(`invPush:${k}`, []);
const savePushes = (k: string, p: PushLog[]) => setSetting(`invPush:${k}`, p.slice(0, 20));
export const getMaps = () => getSetting<Record<string, SkuMap>>('invMap', {});
const saveMaps = (m: Record<string, SkuMap>) => setSetting('invMap', m);

export async function setMapping(ch: string, sku: string, target: string) {
  const all = await getMaps();
  const m = all[ch] ?? { skuMode: false, map: {} };
  if (target.trim()) m.map[sku] = target.trim(); else delete m.map[sku];
  all[ch] = m; await saveMaps(all);
}
export async function setSkuMode(ch: string, on: boolean) {
  const all = await getMaps();
  all[ch] = { ...(all[ch] ?? { map: {} }), skuMode: on }; await saveMaps(all);
}

// ---------- Mirakl ----------

async function conn(ch: string) {
  const c = await db.channelConnection.findUnique({ where: { channelKey: ch } });
  if (!c?.apiUrl || !c.apiKey) throw new Error(`${nameOf(ch)}: API URL / key missing under Connections`);
  return { base: c.apiUrl.replace(/\/+$/, ''), key: c.apiKey, shopId: c.shopId ?? '' };
}

// Every connected Mirakl marketplace — a new one shows up here as soon as it is connected.
export async function connectedChannels(): Promise<string[]> {
  const cs = await db.channelConnection.findMany({ where: { enabled: true }, select: { channelKey: true, apiUrl: true, apiKey: true } });
  return cs.filter((c: { apiUrl: string | null; apiKey: string | null }) => c.apiUrl && c.apiKey).map((c: { channelKey: string }) => c.channelKey);
}

class Limited extends Error {}
async function miraklGet(url: string, key: string, accept = 'application/json') {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: key, Accept: accept } });
    if (res.status !== 429) return res;
    const wait = Math.min(30, Number(res.headers.get('Retry-After')) || 10 * (attempt + 1));
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw new Limited('rate limit');
}

function parseCsv(text: string): Record<string, string>[] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const COOLDOWN_MIN = 10;
const upcIn = (s: unknown) => normUpc((String(s ?? '').match(/\b\d{11,14}\b/) ?? [])[0] ?? '');

// SKU → UPC from what we already know about this marketplace's catalogue (and Nordstrom's own products).
async function catalogUpcBySku(ch: string) {
  const m = new Map<string, string>();
  const spec = channelColumns[ch];
  const cols = [spec?.sku, spec?.altUpc, 'product_id', 'shop_sku', 'shopSku', 'sku', 'SHOP_SKU', 'uid_code'].filter(Boolean) as string[];
  const cps = await db.channelProduct.findMany({ where: { channelKey: ch }, select: { upc: true, channelSku: true, raw: true } });
  for (const c of cps) {
    const u = normUpc(c.upc);
    if (!u) continue;
    const raw = (c.raw ?? {}) as Record<string, string>;
    for (const s of [c.channelSku, ...cols.map((k) => raw[k])]) if (s && String(s).trim()) m.set(String(s).trim().toLowerCase(), u);
  }
  if (ch === 'nordstrom') {
    const ps = await db.product.findMany({ select: { sku: true, gtin: true, attrs: true } });
    for (const p of ps) {
      const a = (p.attrs ?? {}) as Record<string, string>;
      for (const s of [p.sku, a['shop-sku'], a['sku']]) if (s) m.set(String(s).toLowerCase(), normUpc(p.gtin));
    }
  }
  return m;
}

// Offers: OF51 export (one CSV) — falls back to OF21 pages, slowly.
export async function pullOffers(ch: string, opts: { force?: boolean } = {}) {
  const prev = await getSnap(ch);
  if (!opts.force && prev.limitedUntil && new Date(prev.limitedUntil) > new Date()) {
    return { count: prev.items.length, unmatched: prev.items.filter((i) => !i.upc).length, skipped: true };
  }
  const { base, key, shopId } = await conn(ch);
  const shopQ = shopId ? `shop_id=${encodeURIComponent(shopId)}` : '';
  const bySku = await catalogUpcBySku(ch);
  // UPC order: the offer's own UPC/EAN → this marketplace's catalogue (by SKU) → a UPC-looking SKU.
  const make = (sku: string, upcFromOffer: string, weak: string, extra: Partial<SnapItem>, alts: string[] = []): SnapItem => {
    const u = normUpc(upcFromOffer);
    const viaCat = !u ? [sku, ...alts].map((x) => bySku.get(String(x ?? '').trim().toLowerCase())).find(Boolean) ?? '' : '';
    const w = !u && !viaCat ? normUpc(weak) : '';
    return { sku, upc: u || viaCat || w, via: u || w ? 'upc' : viaCat ? 'catalog' : '', qty: 0, price: null, ...extra };
  };
  try {
    let items: SnapItem[] = [];
    const ex = await miraklGet(`${base}/api/offers/export?include_inactive_offers=true${shopQ ? `&${shopQ}` : ''}`, key, 'text/csv, */*');
    if (ex.ok) {
      for (const r of parseCsv(await ex.text())) {
        if (/^(true|1)$/i.test(r['deleted'] ?? '')) continue;
        const sku = r['shop-sku'] ?? r['offer-sku'] ?? r['sku'] ?? '';
        const refCol = Object.keys(r).find((k) => k.includes('reference'));
        const fromOffer = (/(ean|upc|gtin)/i.test(r['product-id-type'] ?? '') ? upcIn(r['product-id']) : '') || (refCol ? upcIn(r[refCol]) : '');
        items.push(make(sku, fromOffer, upcIn(sku) || upcIn(r['product-id']), { qty: Number(r['quantity'] ?? 0), price: r['price'] ? Number(r['price']) : null, title: r['product-title'], state: r['state-code'], pid: r['product-sku'] || r['product-id'] }, [r['product-sku'], r['product-id']]));
      }
    } else {
      const offers: { shop_sku: string; product_sku?: string; product_title?: string; quantity: number; price: number; state_code?: string; product_references?: { reference: string; reference_type: string }[] }[] = [];
      for (let offset = 0; offset < 50000; offset += 100) {
        const res = await miraklGet(`${base}/api/offers?max=100&offset=${offset}${shopQ ? `&${shopQ}` : ''}`, key);
        if (!res.ok) throw new Error(`${nameOf(ch)} offers list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
        const list = (await res.json()).offers ?? [];
        offers.push(...list);
        if (list.length < 100) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      items = offers.map((o) => {
        const refs = o.product_references ?? [];
        const fromOffer = refs.find((x) => /ean|upc|gtin/i.test(x.reference_type))?.reference ?? refs.map((x) => upcIn(x.reference)).find(Boolean) ?? '';
        return make(o.shop_sku, fromOffer, upcIn(o.shop_sku), { qty: Number(o.quantity ?? 0), price: o.price == null ? null : Number(o.price), title: o.product_title, state: o.state_code, pid: o.product_sku }, [o.product_sku ?? '']);
      });
    }
    await productRefs(ch, base, key, shopQ, items);
    await saveSnap(ch, { pulledAt: new Date().toISOString(), error: null, items });
    return { count: items.length, unmatched: items.filter((i) => !i.upc).length };
  } catch (e) {
    if (e instanceof Limited) {
      const until = new Date(Date.now() + COOLDOWN_MIN * 60_000).toISOString();
      await saveSnap(ch, { ...prev, error: `${nameOf(ch)} is limiting requests — showing the last pull, trying again after ${new Date(until).toLocaleTimeString()}`, limitedUntil: until });
      throw new Error(`${nameOf(ch)} is busy (too many requests) — kept the last pull, will retry in ${COOLDOWN_MIN} min`);
    }
    await saveSnap(ch, { ...prev, error: (e as Error).message });
    throw e;
  }
}

// P31 — the marketplace's own product record holds the EAN/UPC. Asked only for offers still without one.
async function productRefs(ch: string, base: string, key: string, shopQ: string, items: SnapItem[]) {
  const cacheKey = `invRef:${ch}`;
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
      try { res = await miraklGet(`${base}/api/products?product_ids=${encodeURIComponent(ids)}&product_id_type=${type}${shopQ ? `&${shopQ}` : ''}`, key); } catch { return; }
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

// ---------- Shopify (barcode = UPC) ----------

export async function pullShopify() {
  const s = (await db.setting.findUnique({ where: { key: 'shopify' } }))?.value as { domain?: string; token?: string } | undefined;
  try {
    if (!s?.domain || !s.token) throw new Error('Shopify is not connected — add it under Connections');
    const items: SnapItem[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 200; page++) {
      const body = JSON.stringify({ query: `query($c:String){ productVariants(first:250, after:$c){ edges{ node{ sku barcode inventoryQuantity price title product{ title status } } } pageInfo{ hasNextPage endCursor } } }`, variables: { c: cursor } });
      let j: { data?: { productVariants: { edges: { node: { sku: string | null; barcode: string | null; inventoryQuantity: number | null; price: string; title: string; product: { title: string; status: string } } }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }; errors?: { message: string; extensions?: { code?: string } }[] } = {};
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(`https://${s.domain}/admin/api/2025-07/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': s.token }, body });
        j = await res.json();
        if (j.errors?.some((e) => e.extensions?.code === 'THROTTLED')) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        break;
      }
      if (j.errors?.length) {
        const msg = j.errors.map((e) => e.message).join('; ');
        throw new Error(/access|scope|permission/i.test(msg) ? `Shopify app needs the read_inventory and read_products permissions (${msg})` : `Shopify: ${msg}`);
      }
      const pv = j.data!.productVariants;
      for (const { node: v } of pv.edges) items.push({ upc: normUpc(v.barcode), via: v.barcode ? 'upc' : '', sku: v.sku ?? '', qty: Number(v.inventoryQuantity ?? 0), price: v.price ? Number(v.price) : null, status: v.product.status, title: `${v.product.title}${v.title && v.title !== 'Default Title' ? ` — ${v.title}` : ''}` });
      if (!pv.pageInfo.hasNextPage) break;
      cursor = pv.pageInfo.endCursor;
    }
    await saveSnap('shopify', { pulledAt: new Date().toISOString(), error: null, items });
    return { count: items.length, unmatched: items.filter((i) => !i.upc).length };
  } catch (e) {
    const prev = await getSnap('shopify');
    await saveSnap('shopify', { ...prev, error: (e as Error).message });
    throw e;
  }
}

export async function pullAll() {
  const out: Record<string, string> = {};
  try { const r = await pullShopify(); out.shopify = `${r.count} variants`; } catch (e) { out.shopify = `Failed: ${(e as Error).message}`; }
  for (const ch of await connectedChannels()) {
    try { const r = await pullOffers(ch); out[ch] = `${r.count} offers${r.unmatched ? `, ${r.unmatched} without UPC` : ''}`; } catch (e) { out[ch] = `Failed: ${(e as Error).message}`; }
  }
  await log('pull', 'Inventory refreshed — ' + Object.entries(out).map(([k, v]) => `${nameOf(k)}: ${v}`).join(' · '));
  return out;
}

// ---------- the grid ----------

export type Via = 'upc' | 'catalog' | 'map' | 'sku';
export interface Cell { qty: number; price: number | null; sku: string; want: number | null; state: 'ok' | 'diff' | 'no-shopify'; via: Via; inactive?: boolean }
export interface ShopCell { qty: number; price: number | null; sku: string; title?: string; variants: number; status?: string }
export interface GridRow { upc: string; title: string; color: string; size: string; shopify: ShopCell | null; cells: Record<string, Cell | null>; mismatch: boolean }
export interface Unmatched { sku: string; title?: string; qty: number; price: number | null }

export async function buildGrid() {
  const cfg = await getCfg();
  const maps = await getMaps();
  const channels = await connectedChannels();
  const marketplaces = [...(channels.includes('nordstrom') ? ['nordstrom'] : []), ...channels.filter((c) => c !== 'nordstrom')];
  const cols = ['shopify', ...marketplaces];
  const snaps = Object.fromEntries(await Promise.all(cols.map(async (c) => [c, await getSnap(c)] as const)));

  // Shopify by barcode. If several variants share a barcode, the active one with most stock wins (and it is flagged).
  const shopBy = new Map<string, ShopCell>();
  const shopSkuToUpc = new Map<string, string>();
  for (const v of snaps.shopify.items) {
    if (v.sku && v.upc) shopSkuToUpc.set(v.sku.toLowerCase(), v.upc);
    if (!v.upc) continue;
    const cur = shopBy.get(v.upc);
    const rank = (x: { status?: string; qty: number }) => (x.status === 'ACTIVE' ? 1e9 : 0) + x.qty;
    if (!cur) shopBy.set(v.upc, { qty: v.qty, price: v.price, sku: v.sku, title: v.title, variants: 1, status: v.status });
    else { const n = cur.variants + 1; if (rank(v) > rank(cur)) shopBy.set(v.upc, { qty: v.qty, price: v.price, sku: v.sku, title: v.title, variants: n, status: v.status }); else cur.variants = n; }
  }

  const products = await db.product.findMany({ select: { gtin: true, title: true, color: true, attrs: true } });
  const info = new Map<string, { title: string; color: string; size: string }>();
  for (const p of products) info.set(normUpc(p.gtin), { title: p.title, color: p.color ?? '', size: ((p.attrs ?? {}) as Record<string, string>)['size-description'] ?? '' });
  for (const c of await db.channelProduct.findMany({ select: { upc: true, title: true, color: true, size: true } })) { const k = normUpc(c.upc); if (k && !info.has(k)) info.set(k, { title: c.title ?? '', color: c.color ?? '', size: c.size ?? '' }); }

  // Each marketplace: UPC first; only offers without a UPC use your SKU mapping.
  const index: Record<string, Map<string, { it: SnapItem; via: Via }>> = {};
  const unmatched: Record<string, Unmatched[]> = {};
  for (const c of marketplaces) {
    index[c] = new Map(); unmatched[c] = [];
    const m = maps[c] ?? { skuMode: false, map: {} };
    for (const it of snaps[c].items) {
      let upc = it.upc, via: Via = it.via === 'catalog' ? 'catalog' : 'upc';
      if (!upc && m.map[it.sku]) { const t = m.map[it.sku]; upc = normUpc(t) || shopSkuToUpc.get(t.toLowerCase()) || ''; via = 'map'; }
      if (!upc && m.skuMode) { upc = shopSkuToUpc.get(it.sku.toLowerCase()) ?? ''; via = 'sku'; }
      if (!upc) { unmatched[c].push({ sku: it.sku, title: it.title, qty: it.qty, price: it.price }); continue; }
      if (!index[c].has(upc)) index[c].set(upc, { it, via });
    }
  }
  const listed: Record<string, Map<string, string>> = {};
  for (const c of marketplaces) {
    listed[c] = new Map();
    if (c === 'nordstrom') for (const p of await db.product.findMany({ select: { gtin: true, sku: true } })) { const u = normUpc(p.gtin); if (u) listed[c].set(u, p.sku ?? ''); }
    else for (const cp of await db.channelProduct.findMany({ where: { channelKey: c }, select: { upc: true, channelSku: true } })) { const u = normUpc(cp.upc); if (u) listed[c].set(u, cp.channelSku ?? ''); }
  }
  const upcs = new Set<string>(); for (const c of marketplaces) { for (const u of index[c].keys()) upcs.add(u); for (const u of listed[c].keys()) upcs.add(u); }

  const rows: GridRow[] = [];
  const shopReady = !!snaps.shopify.pulledAt && !snaps.shopify.error;
  for (const upc of upcs) {
    const shop = shopBy.get(upc) ?? null;
    const cells: Record<string, Cell | null> = {};
    let mismatch = false;
    for (const c of marketplaces) {
      const x = index[c].get(upc) ?? (listed[c].has(upc) ? { it: { upc, sku: listed[c].get(upc) ?? '', qty: 0, price: null } as SnapItem, via: 'catalog' as Via, inactive: true } : null);
      if (!x) { cells[c] = null; continue; }
      const want = shop ? Math.max(0, shop.qty - (cfg.buffers[c] ?? 0)) : null;
      const state: Cell['state'] = !shop ? 'no-shopify' : want === x.it.qty ? 'ok' : 'diff';
      cells[c] = { qty: x.it.qty, price: x.it.price, sku: x.it.sku, want, state, via: x.via, inactive: 'inactive' in x ? true : undefined };
      if (state === 'diff' || (state === 'no-shopify' && shopReady)) mismatch = true;
    }
    const inf = info.get(upc) ?? { title: shop?.title ?? marketplaces.map((c) => index[c].get(upc)?.it.title).find(Boolean) ?? '', color: '', size: '' };
    rows.push({ upc, ...inf, shopify: shop, cells, mismatch });
  }
  rows.sort((a, b) => Number(b.mismatch) - Number(a.mismatch) || a.title.localeCompare(b.title) || a.color.localeCompare(b.color) || a.size.localeCompare(b.size, undefined, { numeric: true }));
  const status = Object.fromEntries(cols.map((c) => [c, { name: nameOf(c), pulledAt: snaps[c].pulledAt, error: snaps[c].error, count: snaps[c].items.length, noUpc: c === 'shopify' ? snaps.shopify.items.filter((i) => !i.upc).length : unmatched[c].length }]));
  const summary = Object.fromEntries(marketplaces.map((c) => {
    const cs = rows.map((r) => r.cells[c]).filter(Boolean) as Cell[];
    return [c, { offers: snaps[c].items.length, matched: cs.length, ok: cs.filter((x) => x.state === 'ok').length, diff: cs.filter((x) => x.state === 'diff').length, noShopify: cs.filter((x) => x.state === 'no-shopify').length, unmatched: unmatched[c].length, bySku: cs.filter((x) => x.via === 'map' || x.via === 'sku').length, buffer: cfg.buffers[c] ?? 0, skuMode: !!maps[c]?.skuMode }];
  }));
  const dupBarcodes = [...shopBy.values()].filter((x) => x.variants > 1).length;
  return { cfg, cols, marketplaces, status, summary, rows, unmatched, maps, dupBarcodes };
}

// ---------- fixing ONE offer by hand (Mirakl OF01, PARTIAL_UPDATE: only quantity changes) ----------

export async function fixOne(ch: string, sku: string, qty: number) {
  if (ch === 'shopify') throw new Error('Shopify is managed by your other sync platform');
  if (!sku || !Number.isInteger(qty) || qty < 0) throw new Error('Enter a whole number, 0 or more');
  const snap = await getSnap(ch);
  const item = snap.items.find((i) => i.sku === sku);
  if (!item) throw new Error(`${sku} is not in the last ${nameOf(ch)} pull — refresh first`);
  const { base, key, shopId } = await conn(ch);
  const form = new FormData();
  form.append('file', new Blob([`sku;quantity\n${sku};${qty}`], { type: 'text/csv' }), `${ch}-stock-${sku}-${Date.now()}.csv`);
  form.append('import_mode', 'PARTIAL_UPDATE');
  const res = await fetch(`${base}/api/offers/imports${shopId ? `?shop_id=${encodeURIComponent(shopId)}` : ''}`, { method: 'POST', headers: { Authorization: key, Accept: 'application/json' }, body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(`${nameOf(ch)} refused the update (${res.status}): ${text.slice(0, 300)}`);
  const id = String(JSON.parse(text).import_id ?? '');
  await savePushes(ch, [{ id, sku, from: item.qty, to: qty, at: new Date().toISOString(), status: 'SENT' }, ...(await getPushes(ch))]);
  item.qty = qty;
  await saveSnap(ch, snap);
  await log('push', `Stock fixed by hand on ${nameOf(ch)}: ${sku} → ${qty} (import ${id})`);
  return { id };
}

// OF02 — status of the hand fixes.
export async function checkPushes(ch: string) {
  const logs = await getPushes(ch);
  const { base, key, shopId } = await conn(ch);
  for (const l of logs.filter((x) => !['COMPLETE', 'FAILED', 'CANCELLED'].includes(x.status)).slice(0, 10)) {
    try {
      const res = await fetch(`${base}/api/offers/imports/${l.id}${shopId ? `?shop_id=${encodeURIComponent(shopId)}` : ''}`, { headers: { Authorization: key, Accept: 'application/json' } });
      if (!res.ok) continue;
      const j = await res.json();
      l.status = j.status ?? l.status;
      l.ok = j.lines_in_success ?? l.ok;
      l.failed = j.lines_in_error ?? l.failed;
    } catch { /* try again later */ }
  }
  await savePushes(ch, logs);
  return logs;
}
