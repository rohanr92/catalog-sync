import { db } from './db';
import { log } from './log';
import { memo } from './memo';
import { connectedChannels, getSnap, getMaps, normUpc, nameOf } from './inventory';

// Sales: every order line from every connected Mirakl marketplace (OR11), kept in SaleLine.
// First run loads the last 12 months (a few pages a minute), then only new/changed orders.
// Lines are matched to your Nordstrom style/colour by UPC (same matching as Inventory).

const DAY = 86_400_000;
const HISTORY_DAYS = 365;
const DEAD = new Set(['CANCELED', 'CANCELLED', 'REFUSED']);

interface SyncState { from: string; offset: number; backfilled: boolean; lastSync: string | null; total: number; error: string | null; at: string | null }
const stateKey = (ch: string) => `sales:${ch}`;
async function getState(ch: string): Promise<SyncState> {
  const v = (await db.setting.findUnique({ where: { key: stateKey(ch) } }))?.value as Partial<SyncState> | undefined;
  return { from: new Date(Date.now() - HISTORY_DAYS * DAY).toISOString(), offset: 0, backfilled: false, lastSync: null, total: 0, error: null, at: null, ...(v ?? {}) };
}
async function setState(ch: string, s: SyncState) { await db.setting.upsert({ where: { key: stateKey(ch) }, update: { value: s as never }, create: { key: stateKey(ch), value: s as never } }); }

async function conn(ch: string) {
  const c = await db.channelConnection.findUnique({ where: { channelKey: ch } });
  if (!c?.apiUrl || !c.apiKey) throw new Error('API URL / key missing');
  return { base: String(c.apiUrl).replace(/\/+$/, ''), key: String(c.apiKey), shopId: String(c.shopId ?? '') };
}

async function getOrders(ch: string, params: Record<string, string>) {
  const c = await conn(ch);
  const q = new URLSearchParams({ max: '100', ...params });
  if (c.shopId) q.set('shop_id', c.shopId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${c.base}/api/orders?${q}`, { headers: { Authorization: c.key, Accept: 'application/json' } });
    if (res.status === 429) { const wait = Math.min(30, Number(res.headers.get('retry-after')) || 10); await new Promise((r) => setTimeout(r, wait * 1000)); continue; }
    if (!res.ok) throw new Error(`Orders (${res.status}) ${(await res.text()).slice(0, 160)}`);
    return (await res.json()) as { orders?: MiraklOrder[]; total_count?: number };
  }
  throw new Error('Too many requests — will try again shortly');
}

interface MiraklLine { order_line_id: string; offer_sku?: string; product_sku?: string; product_title?: string; quantity?: number; price?: number; total_price?: number; order_line_state?: string; refunds?: { quantity?: number; amount?: number }[] }
interface MiraklOrder { order_id: string; created_date: string; currency_iso_code?: string; order_lines?: MiraklLine[] }

async function saveOrders(ch: string, orders: MiraklOrder[]) {
  for (const o of orders) for (const l of o.order_lines ?? []) {
    const refundQty = (l.refunds ?? []).reduce((n, r) => n + (Number(r.quantity) || 0), 0);
    const refundAmt = (l.refunds ?? []).reduce((n, r) => n + (Number(r.amount) || 0), 0);
    const data = {
      channelKey: ch, orderId: o.order_id, lineId: String(l.order_line_id), createdAt: new Date(o.created_date),
      state: String(l.order_line_state ?? ''), sku: String(l.offer_sku ?? l.product_sku ?? ''), title: String(l.product_title ?? ''),
      qty: Number(l.quantity) || 0, refundQty, refundAmt, price: Number(l.price) || 0, total: Number(l.total_price ?? l.price) || 0,
      currency: String(o.currency_iso_code ?? 'USD'),
    };
    const id = `${ch}:${l.order_line_id}`;
    await db.saleLine.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
}

// One step for one marketplace: a few pages of history, or the latest changes.
export async function syncChannel(ch: string, maxPages = 5) {
  const s = await getState(ch);
  const started = new Date().toISOString();
  try {
    if (!s.backfilled) {
      for (let p = 0; p < maxPages; p++) {
        const j = await getOrders(ch, { start_date: s.from, sort: 'dateCreated', order: 'asc', offset: String(s.offset) });
        const orders = j.orders ?? [];
        await saveOrders(ch, orders);
        s.offset += orders.length; s.total += orders.length;
        if (orders.length < 100) { s.backfilled = true; s.lastSync = started; break; }
      }
    } else {
      const since = new Date(new Date(s.lastSync ?? started).getTime() - 5 * 60_000).toISOString();
      let offset = 0;
      for (let p = 0; p < 20; p++) {
        const j = await getOrders(ch, { start_update_date: since, offset: String(offset) });
        const orders = j.orders ?? [];
        await saveOrders(ch, orders);
        offset += orders.length;
        if (orders.length < 100) break;
      }
      s.lastSync = started;
    }
    s.error = null;
  } catch (e) {
    s.error = (e as Error).message;
  }
  s.at = new Date().toISOString();
  await setState(ch, s);
  return s;
}

let running = false;
export async function salesTick() {
  if (running) return;
  running = true;
  try {
    for (const ch of await connectedChannels()) {
      const before = await getState(ch);
      const s = await syncChannel(ch);
      if (s.backfilled && !before.backfilled) await log('pull', `Sales: ${nameOf(ch)} order history loaded (${s.total} orders)`);
    }
  } finally { running = false; }
}

export async function syncStatus() {
  const out: Record<string, SyncState & { name: string }> = {};
  for (const ch of await connectedChannels()) out[ch] = { ...(await getState(ch)), name: nameOf(ch) };
  return out;
}

// ---------- the report ----------
type Money = Record<string, number>;
const add = (m: Money, cur: string, v: number) => { m[cur] = (m[cur] ?? 0) + v; };
export type Label = 'best' | 'rising' | 'falling' | 'slow' | 'none' | 'ok';
export interface SalesRow {
  key: string; styleCode: string; color: string; title: string; thumb: string;
  units: number; prevUnits: number; change: number | null; revenue: Money; orders: number; returns: number;
  byChannel: Record<string, { units: number; revenue: Money }>; sizes: Record<string, number>;
  liveOn: string[]; stock: number | null; weeksLeft: number | null; label: Label;
}

async function buildSalesNow(days: number, group: 'color' | 'style') {
  const now = Date.now();
  const from = new Date(now - days * DAY), prevFrom = new Date(now - 2 * days * DAY);
  const channels = await connectedChannels();

  // UPC → your style / colour / size
  const info = new Map<string, { style: string; color: string; size: string; title: string; thumb: string }>();
  const products = await db.product.findMany({ select: { gtin: true, sku: true, title: true, color: true, attrs: true, images: { orderBy: { position: 'asc' }, take: 1, select: { sourceUrl: true, storedUrl: true } } } });
  for (const p of products) {
    const a = (p.attrs ?? {}) as Record<string, string>;
    info.set(normUpc(p.gtin), { style: a['variant-group-code'] || a['vpn'] || p.sku || p.gtin, color: p.color ?? '', size: a['size-description'] ?? '', title: p.title, thumb: p.images[0]?.storedUrl || p.images[0]?.sourceUrl || '' });
  }
  const cps = await db.channelProduct.findMany({ select: { upc: true, styleCode: true, color: true, size: true, title: true, images: true } });
  for (const c of cps) {
    const u = normUpc(c.upc);
    if (!u || info.has(u)) continue;
    const imgs = (c.images as string[] | null) ?? [];
    info.set(u, { style: c.styleCode ?? u, color: c.color ?? '', size: c.size ?? '', title: c.title ?? '', thumb: imgs.find((x) => typeof x === 'string' && x.startsWith('http')) ?? '' });
  }

  // offer SKU → UPC per marketplace (from the Inventory offers + your SKU mappings)
  const maps = await getMaps();
  const skuUpc: Record<string, Map<string, string>> = {};
  const live: Record<string, Set<string>> = {};
  for (const ch of channels) {
    const m = new Map<string, string>();
    const snap = await getSnap(ch);
    live[ch] = new Set();
    for (const it of snap.items) { if (it.sku && it.upc) m.set(it.sku.toLowerCase(), it.upc); if (it.upc && it.qty > 0) live[ch].add(it.upc); }
    for (const [sku, target] of Object.entries(maps[ch]?.map ?? {})) { const u = normUpc(target); if (u) m.set(sku.toLowerCase(), u); }
    skuUpc[ch] = m;
  }
  const shopStock = new Map<string, number>();
  for (const it of (await getSnap('shopify')).items) if (it.upc) shopStock.set(it.upc, Math.max(shopStock.get(it.upc) ?? 0, it.qty));

  const keyOf = (i: { style: string; color: string }) => (group === 'style' ? i.style : `${i.style}|${i.color}`);
  const rows = new Map<string, SalesRow & { _upcs: Set<string> }>();
  const rowFor = (i: { style: string; color: string; title: string; thumb: string }) => {
    const k = keyOf(i);
    if (!rows.has(k)) rows.set(k, { key: k, styleCode: i.style, color: group === 'style' ? '' : i.color, title: i.title, thumb: i.thumb, units: 0, prevUnits: 0, change: null, revenue: {}, orders: 0, returns: 0, byChannel: {}, sizes: {}, liveOn: [], stock: null, weeksLeft: null, label: 'ok', _upcs: new Set() });
    const r = rows.get(k)!;
    if (!r.thumb && i.thumb) r.thumb = i.thumb;
    return r;
  };

  const lines = (await db.saleLine.findMany({ where: { createdAt: { gte: prevFrom }, channelKey: { in: channels } }, select: { channelKey: true, orderId: true, createdAt: true, state: true, sku: true, title: true, qty: true, refundQty: true, refundAmt: true, total: true, currency: true } })) as
    { channelKey: string; orderId: string; createdAt: Date; state: string; sku: string; title: string; qty: number; refundQty: number; refundAmt: number; total: number; currency: string }[];

  const cards: Record<string, { name: string; units: number; prevUnits: number; revenue: Money; orders: Set<string>; daily: number[] }> = {};
  for (const ch of channels) cards[ch] = { name: nameOf(ch), units: 0, prevUnits: 0, revenue: {}, orders: new Set(), daily: Array(Math.min(days, 90)).fill(0) };

  for (const l of lines) {
    if (DEAD.has(l.state.toUpperCase())) continue;
    const sku = l.sku.toLowerCase();
    const upc = skuUpc[l.channelKey]?.get(sku) ?? normUpc(l.sku);
    const i = info.get(upc) ?? { style: l.sku || l.title, color: '', size: '', title: l.title || l.sku, thumb: '' };
    const r = rowFor(i);
    if (upc) r._upcs.add(upc);
    const units = Math.max(0, l.qty - l.refundQty);
    const card = cards[l.channelKey];
    if (l.createdAt >= from) {
      r.units += units; r.orders++; r.returns += l.refundQty;
      add(r.revenue, l.currency, l.total - l.refundAmt);
      const bc = (r.byChannel[l.channelKey] ??= { units: 0, revenue: {} });
      bc.units += units; add(bc.revenue, l.currency, l.total - l.refundAmt);
      if (i.size) r.sizes[i.size] = (r.sizes[i.size] ?? 0) + units;
      if (card) {
        card.units += units; add(card.revenue, l.currency, l.total - l.refundAmt); card.orders.add(l.orderId);
        const d = Math.floor((now - l.createdAt.getTime()) / DAY);
        if (d < card.daily.length) card.daily[card.daily.length - 1 - d] += units;
      }
    } else { r.prevUnits += units; if (card) card.prevUnits += units; }
  }

  // styles that are live with stock somewhere but did not sell
  for (const ch of channels) for (const u of live[ch]) { const i = info.get(u); if (i) rowFor(i)._upcs.add(u); }

  const list = [...rows.values()];
  for (const r of list) {
    r.liveOn = channels.filter((ch) => [...r._upcs].some((u) => live[ch].has(u)));
    const st = [...r._upcs].map((u) => shopStock.get(u)).filter((x): x is number => x !== undefined);
    r.stock = st.length ? st.reduce((a, b) => a + b, 0) : null;
    const perWeek = (r.units / days) * 7;
    r.weeksLeft = r.stock !== null && perWeek > 0 ? Math.round((r.stock / perWeek) * 10) / 10 : null;
    r.change = r.prevUnits > 0 ? Math.round(((r.units - r.prevUnits) / r.prevUnits) * 100) : null;
  }
  const selling = list.filter((r) => r.units > 0).sort((a, b) => b.units - a.units);
  const bestCut = Math.max(2, selling[Math.max(0, Math.ceil(selling.length * 0.1) - 1)]?.units ?? 2);
  for (const r of list) {
    if (r.units >= bestCut) r.label = 'best';
    else if (r.units >= 3 && r.prevUnits > 0 && r.units >= r.prevUnits * 1.5) r.label = 'rising';
    else if (r.prevUnits >= 3 && r.units <= r.prevUnits * 0.5) r.label = 'falling';
    else if (r.units === 0 && r.liveOn.length) r.label = 'none';
    else if (r.units <= 2 && r.liveOn.length) r.label = 'slow';
    else r.label = 'ok';
  }
  const clean = list.filter((r) => r.units > 0 || r.prevUnits > 0 || r.liveOn.length).map(({ _upcs, ...r }) => { void _upcs; return r; });
  clean.sort((a, b) => b.units - a.units || b.prevUnits - a.prevUnits || a.title.localeCompare(b.title));

  const summary = Object.fromEntries(Object.entries(cards).map(([ch, c]) => [ch, {
    name: c.name, units: c.units, prevUnits: c.prevUnits, revenue: c.revenue, orders: c.orders.size, daily: c.daily,
    change: c.prevUnits ? Math.round(((c.units - c.prevUnits) / c.prevUnits) * 100) : null,
    top: clean.filter((r) => r.byChannel[ch]?.units).sort((a, b) => (b.byChannel[ch]?.units ?? 0) - (a.byChannel[ch]?.units ?? 0)).slice(0, 3).map((r) => ({ title: r.title, color: r.color, units: r.byChannel[ch].units })),
  }]));
  return { channels, summary, rows: clean };
}

export const buildSales = (days: number, group: 'color' | 'style') => memo(`sales:${days}:${group}`, 3 * 60_000, () => buildSalesNow(days, group));
