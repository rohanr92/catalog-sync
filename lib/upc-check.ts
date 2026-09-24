import { db } from './db';
import { getProducts, getChannelProducts } from './static-data';
import { sourceSizeOf } from './sizes';

type Row = Record<string, string>;
const n = (u: string) => String(u ?? '').trim().replace(/^0+/, '');
const ns = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9.]+/g, '');

export async function upcCheck(channelKey: string) {
  const [products, rows, dup] = await Promise.all([getProducts(), getChannelProducts(channelKey), db.setting.findUnique({ where: { key: 'dupes:' + channelKey } })]);
  const nord = new Map(products.map((p) => [n(p.gtin), p]));
  const chan = new Map(rows.map((r) => [n(r.upc), r]));
  const styleOf = (p: (typeof products)[number]) => (p.attrs as Row)['variant-group-code'] || (p.attrs as Row)['vpn'] || p.sku || p.gtin;
  const chKey = (r: (typeof rows)[number]) => `${r.styleCode || r.title || ''}|${(r.color ?? '').toLowerCase()}`;

  // How Nordstrom sizes are written on this marketplace, learned from the UPCs that do match.
  const tally = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const p = nord.get(n(r.upc));
    const a = p ? ns(sourceSizeOf(p.attrs as Row)) : '';
    if (!a || !r.size) continue;
    if (!tally.has(a)) tally.set(a, new Map());
    tally.get(a)!.set(ns(r.size), (tally.get(a)!.get(ns(r.size)) ?? 0) + 1);
  }
  const sizeMap = new Map([...tally].map(([a, m]) => [a, [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]]));

  const groups = new Map<string, typeof products>();
  for (const p of products) { const k = `${styleOf(p)}|${p.color ?? ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(p); }

  // Same style, colour and size on both sides, but a different UPC.
  const used = new Set<string>();
  const mismatches: { nordstromUpc: string; marketplaceUpc: string; title: string; color: string; size: string; marketplaceSize: string; marketplaceSku: string; marketplaceTitle: string }[] = [];
  for (const ps of groups.values()) {
    const matched = ps.filter((p) => chan.has(n(p.gtin)));
    const missing = ps.filter((p) => !chan.has(n(p.gtin)));
    if (!matched.length || !missing.length) continue;
    const votes = new Map<string, number>();
    for (const p of matched) { const k = chKey(chan.get(n(p.gtin))!); votes.set(k, (votes.get(k) ?? 0) + 1); }
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const candidates = rows.filter((r) => chKey(r) === top && !nord.has(n(r.upc)));
    for (const p of missing) {
      const own = ns(sourceSizeOf(p.attrs as Row));
      const want = sizeMap.get(own) ?? own;
      const c = candidates.find((r) => !used.has(n(r.upc)) && r.size && (ns(r.size) === want || ns(r.size) === own));
      if (!c) continue;
      used.add(n(c.upc));
      mismatches.push({ nordstromUpc: p.gtin, marketplaceUpc: c.upc, title: p.title, color: p.color ?? '', size: sourceSizeOf(p.attrs as Row), marketplaceSize: c.size ?? '', marketplaceSku: c.channelSku ?? '', marketplaceTitle: c.title ?? '' });
    }
  }

  const orphans = rows.filter((r) => !nord.has(n(r.upc)) && !used.has(n(r.upc)))
    .map((r) => ({ upc: r.upc, title: r.title ?? '', style: r.styleCode ?? '', color: r.color ?? '', size: r.size ?? '', sku: r.channelSku ?? '' }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.color.localeCompare(b.color));

  const duplicates = (((dup?.value as { upc: string; n: number }[] | undefined) ?? [])).map((d) => {
    const r = chan.get(n(d.upc));
    return { upc: d.upc, rows: d.n, title: r?.title ?? '', color: r?.color ?? '', size: r?.size ?? '' };
  });

  return { checked: rows.length, mismatches, orphans, duplicates };
}
