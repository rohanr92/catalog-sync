import { db } from './db';
import { log } from './log';

// Inventory: Shopify + every Mirakl marketplace (Nordstrom included), matched by UPC only. View only.

export interface InvCfg { buffers: Record<string, number> } // units kept back per marketplace
export interface SnapItem { upc: string; sku: string; qty: number; price: number | null; title?: string; state?: string }
export interface Snap { pulledAt: string | null; error: string | null; items: SnapItem[] }
export interface PushLog { id: string; sku: string; from: number; to: number; at: string; status: string; ok?: number; failed?: number }

const NAMES: Record<string, string> = { shopify: 'Shopify', nordstrom: 'Nordstrom', macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus' };
export const nameOf = (k: string) => NAMES[k] ?? k;
export const normUpc = (u: unknown) => String(u ?? '').replace(/\D/g, '').replace(/^0+/, '');

async function getSetting<T>(key: string, d: T): Promise<T> { return ((await db.setting.findUnique({ where: { key } }))?.value as unknown as T) ?? d; }
async function setSetting(key: string, value: unknown) { await db.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } }); }

export const getCfg = async (): Promise<InvCfg> => ({ buffers: {}, ...(await getSetting<Partial<InvCfg>>('inventory', {})) });
export const saveCfg = (c: InvCfg) => setSetting('inventory', c);
export const getSnap = (k: string) => getSetting<Snap>(`inv:${k}`, { pulledAt: null, error: null, items: [] });
const saveSnap = (k: string, s: Snap) => setSetting(`inv:${k}`, s);
export const getPushes = (k: string) => getSetting<PushLog[]>(`invPush:${k}`, []);
const savePushes = (k: string, p: PushLog[]) => setSetting(`invPush:${k}`, p.slice(0, 20));

// ---------- Mirakl ----------

async function conn(ch: string) {
  const c = await db.channelConnection.findUnique({ where: { channelKey: ch } });
  if (!c?.apiUrl || !c.apiKey) throw new Error(`${nameOf(ch)}: API URL / key missing under Connections`);
  return { base: c.apiUrl.replace(/\/+$/, ''), key: c.apiKey, shopId: c.shopId ?? '' };
}

export async function connectedChannels(): Promise<string[]> {
  const cs = await db.channelConnection.findMany({ where: { enabled: true }, select: { channelKey: true, apiUrl: true, apiKey: true } });
  return cs.filter((c: { apiUrl: string | null; apiKey: string | null }) => c.apiUrl && c.apiKey).map((c: { channelKey: string }) => c.channelKey);
}

interface Offer { shop_sku: string; product_sku?: string; product_title?: string; quantity: number; price: number; state_code?: string; product_references?: { reference: string; reference_type: string }[] }

// OF21 — every offer in the shop.
export async function pullOffers(ch: string) {
  const { base, key, shopId } = await conn(ch);
  const offers: Offer[] = [];
  try {
    for (let offset = 0; offset < 50000; offset += 100) {
      const q = new URLSearchParams({ max: '100', offset: String(offset) });
      if (shopId) q.set('shop_id', shopId);
      const res = await fetch(`${base}/api/offers?${q}`, { headers: { Authorization: key, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`${nameOf(ch)} offers list failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      const list: Offer[] = j.offers ?? [];
      offers.push(...list);
      if (list.length < 100) break;
    }
    // UPC from the offer's product references; otherwise through the catalogue by SKU.
    const cps = await db.channelProduct.findMany({ where: { channelKey: ch }, select: { upc: true, channelSku: true } });
    const bySku = new Map<string, string>(cps.filter((c: { channelSku: string | null }) => c.channelSku).map((c: { upc: string; channelSku: string | null }): [string, string] => [c.channelSku!.toLowerCase(), c.upc]));
    const items: SnapItem[] = offers.map((o) => {
      const ref = (o.product_references ?? []).find((r) => /ean|upc|gtin/i.test(r.reference_type) && /^\d{8,14}$/.test(r.reference))?.reference
        ?? (o.product_references ?? []).find((r) => /^\d{11,14}$/.test(r.reference))?.reference
        ?? bySku.get(String(o.shop_sku).toLowerCase()) ?? (/^\d{11,14}$/.test(String(o.product_sku)) ? o.product_sku : '') ?? '';
      return { upc: normUpc(ref), sku: o.shop_sku, qty: Number(o.quantity ?? 0), price: o.price == null ? null : Number(o.price), title: o.product_title, state: o.state_code };
    });
    await saveSnap(ch, { pulledAt: new Date().toISOString(), error: null, items });
    return { count: items.length, unmatched: items.filter((i) => !i.upc).length };
  } catch (e) {
    const prev = await getSnap(ch);
    await saveSnap(ch, { ...prev, error: (e as Error).message });
    throw e;
  }
}

// ---------- Shopify ----------

export async function pullShopify() {
  const s = (await db.setting.findUnique({ where: { key: 'shopify' } }))?.value as { domain?: string; token?: string } | undefined;
  try {
    if (!s?.domain || !s.token) throw new Error('Shopify is not connected — add it under Connections');
    const items: SnapItem[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 200; page++) {
      const body = JSON.stringify({ query: `query($c:String){ productVariants(first:250, after:$c){ edges{ node{ sku barcode inventoryQuantity price title product{ title } } } pageInfo{ hasNextPage endCursor } } }`, variables: { c: cursor } });
      let j: { data?: { productVariants: { edges: { node: { sku: string | null; barcode: string | null; inventoryQuantity: number | null; price: string; title: string; product: { title: string } } }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }; errors?: { message: string; extensions?: { code?: string } }[] } = {};
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
      for (const { node: v } of pv.edges) items.push({ upc: normUpc(v.barcode), sku: v.sku ?? '', qty: Number(v.inventoryQuantity ?? 0), price: v.price ? Number(v.price) : null, title: `${v.product.title}${v.title && v.title !== 'Default Title' ? ` — ${v.title}` : ''}` });
      if (!pv.pageInfo.hasNextPage) break;
      cursor = pv.pageInfo.endCursor;
    }
    // Variants with no barcode: match through the Nordstrom SKU.
    const noUpc = items.filter((i) => !i.upc && i.sku);
    if (noUpc.length) {
      const ps = await db.product.findMany({ where: { sku: { in: noUpc.map((i) => i.sku) } }, select: { sku: true, gtin: true } });
      const m = new Map<string, string>(ps.map((p: { sku: string | null; gtin: string }): [string, string] => [String(p.sku), p.gtin]));
      noUpc.forEach((i) => { i.upc = normUpc(m.get(i.sku)); });
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

// ---------- the grid (view only: Shopify is the source, minus each marketplace's buffer) ----------

export interface Cell { qty: number; price: number | null; sku: string; want: number | null; state: 'ok' | 'diff' | 'no-shopify' }
export interface GridRow { upc: string; title: string; color: string; size: string; shopify: SnapItem | null; cells: Record<string, Cell | null>; mismatch: boolean }

export async function buildGrid() {
  const cfg = await getCfg();
  const channels = await connectedChannels();
  const marketplaces = [...(channels.includes('nordstrom') ? ['nordstrom'] : []), ...channels.filter((c) => c !== 'nordstrom')];
  const cols = ['shopify', ...marketplaces];
  const snaps = Object.fromEntries(await Promise.all(cols.map(async (c) => [c, await getSnap(c)] as const)));

  const products = await db.product.findMany({ select: { gtin: true, title: true, color: true, attrs: true } });
  const info = new Map<string, { title: string; color: string; size: string }>();
  for (const p of products) info.set(normUpc(p.gtin), { title: p.title, color: p.color ?? '', size: ((p.attrs ?? {}) as Record<string, string>)['size-description'] ?? '' });
  for (const c of await db.channelProduct.findMany({ select: { upc: true, title: true, color: true, size: true } })) { const k = normUpc(c.upc); if (!info.has(k)) info.set(k, { title: c.title ?? '', color: c.color ?? '', size: c.size ?? '' }); }

  const index: Record<string, Map<string, SnapItem>> = {};
  for (const c of cols) { index[c] = new Map(); for (const it of snaps[c].items) if (it.upc && !index[c].has(it.upc)) index[c].set(it.upc, it); }
  const upcs = new Set<string>(); for (const c of marketplaces) for (const u of index[c].keys()) upcs.add(u);

  const rows: GridRow[] = [];
  const shopReady = !!snaps.shopify.pulledAt && !snaps.shopify.error;
  for (const upc of upcs) {
    const shop = index.shopify.get(upc) ?? null;
    const cells: Record<string, Cell | null> = {};
    let mismatch = false;
    for (const c of marketplaces) {
      const it = index[c].get(upc);
      if (!it) { cells[c] = null; continue; }
      const want = shop ? Math.max(0, shop.qty - (cfg.buffers[c] ?? 0)) : null;
      const state: Cell['state'] = !shop ? 'no-shopify' : want === it.qty ? 'ok' : 'diff';
      cells[c] = { qty: it.qty, price: it.price, sku: it.sku, want, state };
      if (state === 'diff' || (state === 'no-shopify' && shopReady)) mismatch = true;
    }
    const inf = info.get(upc) ?? { title: shop?.title ?? marketplaces.map((c) => index[c].get(upc)?.title).find(Boolean) ?? '', color: '', size: '' };
    rows.push({ upc, ...inf, shopify: shop, cells, mismatch });
  }
  rows.sort((a, b) => Number(b.mismatch) - Number(a.mismatch) || a.title.localeCompare(b.title) || a.color.localeCompare(b.color) || a.size.localeCompare(b.size, undefined, { numeric: true }));
  const status = Object.fromEntries(cols.map((c) => [c, { name: nameOf(c), pulledAt: snaps[c].pulledAt, error: snaps[c].error, count: snaps[c].items.length, noUpc: snaps[c].items.filter((i) => !i.upc).length }]));
  const summary = Object.fromEntries(marketplaces.map((c) => {
    const cs = rows.map((r) => r.cells[c]).filter(Boolean) as Cell[];
    return [c, { offers: cs.length, ok: cs.filter((x) => x.state === 'ok').length, diff: cs.filter((x) => x.state === 'diff').length, noShopify: cs.filter((x) => x.state === 'no-shopify').length, buffer: cfg.buffers[c] ?? 0 }];
  }));
  return { cfg, cols, marketplaces, status, summary, rows };
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
