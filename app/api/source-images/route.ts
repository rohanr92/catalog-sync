import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

type Row = Record<string, string>;
type Found = { source: string; title: string; color: string; style: string; upc: string; images: string[]; matchedBy: string };

const NAMES: Record<string, string> = { nordstrom: 'Nordstrom', macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus' };

// 810205995311, 0810205995311, 00810205995311 are the same barcode
function variants(codes: string[]) {
  const out = new Set<string>();
  for (const c of codes) {
    const d = String(c ?? '').replace(/\D/g, '');
    if (d.length < 8) continue;
    const bare = d.replace(/^0+/, '');
    out.add(d); out.add(bare);
    for (const n of [12, 13, 14]) if (bare.length <= n) out.add(bare.padStart(n, '0'));
  }
  return [...out];
}
const strs = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => (typeof x === 'string' ? x : (x as { url?: string })?.url)).filter((x): x is string => !!x && /^https?:/.test(x));
const styleOf = (p: { sku: string | null; gtin: string; attrs: unknown }) => { const a = (p.attrs ?? {}) as Row; return a['variant-group-code'] || a['vpn'] || p.sku || p.gtin; };
const same = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const productSelect = { gtin: true, sku: true, title: true, color: true, attrs: true, images: { orderBy: { position: 'asc' as const }, select: { sourceUrl: true, storedUrl: true } } };
type P = { gtin: string; sku: string | null; title: string; color: string | null; attrs: unknown; images: { sourceUrl: string; storedUrl: string | null }[] };
const fromProduct = (p: P, matchedBy: string): Found => ({ source: 'nordstrom', title: p.title, color: p.color ?? '', style: styleOf(p), upc: p.gtin, images: p.images.map((i) => i.storedUrl || i.sourceUrl).filter(Boolean), matchedBy });
const best = <T extends { images: string[] }>(xs: T[]) => xs.sort((a, b) => b.images.length - a.images.length)[0];

function wordsWhere(q: string, fields: string[]) {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  return { AND: words.map((w) => ({ OR: fields.map((f) => ({ [f]: { contains: w, mode: 'insensitive' } })) })) };
}

async function searchNordstrom(q: string) {
  const codes = variants([q]);
  const where = codes.length ? { gtin: { in: codes } } : wordsWhere(q, ['title', 'color', 'sku']);
  const ps = (await db.product.findMany({ where: where as never, select: productSelect, take: 300 })) as P[];
  const groups = new Map<string, Found[]>();
  for (const p of ps) { const k = styleOf(p) + '|' + (p.color ?? ''); groups.set(k, [...(groups.get(k) ?? []), fromProduct(p, 'search')]); }
  return [...groups.values()].map(best).filter((f) => f.images.length).slice(0, 24);
}

async function searchChannel(channelKey: string, q: string) {
  const codes = variants([q]);
  const where = codes.length ? { channelKey, upc: { in: codes } } : { channelKey, ...wordsWhere(q, ['title', 'color', 'channelSku', 'styleCode']) };
  const cps = await db.channelProduct.findMany({ where: where as never, select: { upc: true, title: true, color: true, styleCode: true, channelSku: true, images: true }, take: 300 });
  const groups = new Map<string, Found[]>();
  for (const c of cps) {
    const f: Found = { source: channelKey, title: c.title ?? '', color: c.color ?? '', style: c.styleCode ?? c.channelSku ?? '', upc: c.upc, images: strs(c.images), matchedBy: 'search' };
    const k = f.style + '|' + f.color; groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  return [...groups.values()].map(best).filter((f) => f.images.length).slice(0, 24);
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const q = u.searchParams.get('q');
    const source = u.searchParams.get('source') ?? 'nordstrom';
    if (q != null) {
      const results = source === 'nordstrom' ? await searchNordstrom(q) : await searchChannel(source, q);
      return NextResponse.json({ results });
    }

    const style = u.searchParams.get('style') ?? '';
    const color = u.searchParams.get('color') ?? '';
    const title = u.searchParams.get('title') ?? '';
    const current = u.searchParams.get('channel') ?? '';
    let codes = variants((u.searchParams.get('gtins') ?? '').split(','));

    // ---- Nordstrom: UPC first, then style + colour, then title + colour
    let nord: Found | undefined;
    if (codes.length) {
      const ps = (await db.product.findMany({ where: { gtin: { in: codes } }, select: productSelect })) as P[];
      nord = best(ps.map((p) => fromProduct(p, 'UPC')));
    }
    if (!nord?.images.length && color) {
      const ps = ((await db.product.findMany({ where: { color: { equals: color, mode: 'insensitive' } }, select: productSelect, take: 2000 })) as P[]).filter((p) => same(styleOf(p), style));
      if (ps.length) { nord = best(ps.map((p) => fromProduct(p, 'style + colour'))); if (!codes.length) codes = variants(ps.map((p) => p.gtin)); }
    }
    if (!nord?.images.length && title) {
      const words = title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, 3).join(' ');
      const ps = words ? ((await db.product.findMany({ where: wordsWhere(words + ' ' + color, ['title', 'color']) as never, select: productSelect, take: 200 })) as P[]) : [];
      if (ps.length) nord = best(ps.map((p) => fromProduct(p, 'title + colour')));
    }
    if (nord && !codes.length) codes = variants([nord.upc]);

    // ---- Other marketplaces: UPC first, then style + colour
    const byChannel = new Map<string, Found[]>();
    const add = (c: { channelKey: string; upc: string; title: string | null; color: string | null; styleCode: string | null; channelSku: string | null; images: unknown }, how: string) => {
      if (c.channelKey === current) return;
      const f: Found = { source: c.channelKey, title: c.title ?? '', color: c.color ?? '', style: c.styleCode ?? c.channelSku ?? '', upc: c.upc, images: strs(c.images), matchedBy: how };
      byChannel.set(c.channelKey, [...(byChannel.get(c.channelKey) ?? []), f]);
    };
    const sel = { channelKey: true, upc: true, title: true, color: true, styleCode: true, channelSku: true, images: true };
    if (codes.length) (await db.channelProduct.findMany({ where: { upc: { in: codes } }, select: sel })).forEach((c) => add(c, 'UPC'));
    if (style) (await db.channelProduct.findMany({ where: { styleCode: style, color: { equals: color, mode: 'insensitive' } }, select: sel })).forEach((c) => { if (!byChannel.get(c.channelKey)?.some((f) => f.images.length)) add(c, 'style + colour'); });

    const withData = (await db.channelProduct.groupBy({ by: ['channelKey'] })).map((g) => g.channelKey);
    const keys = [...new Set([...withData, ...byChannel.keys()])].filter((k) => k !== current && k !== 'nordstrom');
    const rows = [
      { source: 'nordstrom', name: NAMES.nordstrom, found: nord?.images.length ? nord : null },
      ...keys.map((k) => { const f = best((byChannel.get(k) ?? []).filter((x) => x.images.length)); return { source: k, name: NAMES[k] ?? k, found: f ?? null }; }),
    ];
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
