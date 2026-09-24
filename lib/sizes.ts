import { getValueLists } from "./static-data";
import { db } from './db';
import { sizeListAttributes } from './channel-specs';

const num = (s: string) => { const m = String(s ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type SizeSource = 'manual' | 'siblings' | 'default' | 'list' | 'none';
export interface SizeResolver {
  allowed: string[];
  resolve(styleCode: string, sourceSize: string, pairs: { source: string; channel: string }[], isShoe: boolean): { size: string; source: SizeSource };
}

export async function allowedSizes(channelKey: string): Promise<string[]> {
  const attrs = sizeListAttributes[channelKey] ?? [];
  if (!attrs.length) return [];
  const lists = await getValueLists(channelKey);
  const out = new Set<string>();
  for (const l of lists) {
    const match = attrs.some((a) => (a.endsWith('*') ? l.attribute.startsWith(a.slice(0, -1)) : l.attribute === a));
    if (match) for (const v of l.values as string[]) out.add(v);
  }
  return [...out].sort((a, b) => (num(a) - num(b)) || a.localeCompare(b));
}

// Common clothing size spellings, used only to match against the marketplace's own accepted list.
const aliases: Record<string, string[]> = {
  xs: ['xs', 'x small', 'xsmall', 'extra small'], s: ['s', 'small'], m: ['m', 'medium'], l: ['l', 'large'],
  xl: ['xl', 'x large', 'xlarge', 'extra large'], xxl: ['xxl', 'xx large', '2xl', '2x large', '2x'], xxxl: ['xxxl', '3xl', '3x large', '3x'],
};
function aliasKey(s: string) { const n = norm(s); for (const [k, list] of Object.entries(aliases)) if (list.includes(n)) return k; return n; }

export async function loadSizeResolver(channelKey: string): Promise<SizeResolver> {
  const [rows, allowed] = await Promise.all([db.sizeMap.findMany({ where: { channelKey } }), allowedSizes(channelKey)]);
  const allowedSet = new Set(allowed);
  const byNorm = new Map(allowed.map((a) => [norm(a), a]));
  const byAlias = new Map<string, string>();
  for (const a of allowed) { const k = aliasKey(a); if (!byAlias.has(k)) byAlias.set(k, a); }
  const manualStyle = new Map<string, string>();
  const defaults = new Map<string, string>();
  for (const r of rows) { if (r.styleCode) manualStyle.set(`${r.styleCode}|${r.sourceSize}`, r.targetSize); else defaults.set(r.sourceSize, r.targetSize); }
  const ok = (s: string) => allowedSet.size === 0 || allowedSet.has(s);
  const fromList = (s: string) => allowedSet.size === 0 ? s : (allowedSet.has(s) ? s : byNorm.get(norm(s)) ?? byAlias.get(aliasKey(s)) ?? '');

  return {
    allowed,
    resolve(styleCode, sourceSize, pairs, isShoe) {
      const m = manualStyle.get(`${styleCode}|${sourceSize}`);
      if (m) return { size: m, source: ok(m) ? 'manual' : 'none' };

      const exact = pairs.find((p) => p.source === sourceSize || (!isShoe && aliasKey(p.source) === aliasKey(sourceSize)));
      if (exact && ok(exact.channel)) return { size: exact.channel, source: 'siblings' };

      if (isShoe) {
        const eu = num(sourceSize);
        if (!isNaN(eu) && pairs.length) {
          const offsets = new Map<number, number>();
          for (const p of pairs) { const a = num(p.source), b = num(p.channel); if (!isNaN(a) && !isNaN(b)) offsets.set(a - b, (offsets.get(a - b) ?? 0) + 1); }
          if (offsets.size) {
            const [best] = [...offsets.entries()].sort((x, y) => y[1] - x[1])[0];
            const us = eu - best;
            const text = Number.isInteger(us) ? String(us) : us.toFixed(1);
            const sample = pairs[0].channel;
            const size = sample.includes(' US') ? sample.replace(/^[\d.]+/, text).replace(/(\d+)( EU)/, `${eu}$2`) : text;
            if (ok(size)) return { size, source: 'siblings' };
          }
        }
      }

      const d = defaults.get(sourceSize);
      if (d && ok(d)) return { size: d, source: 'default' };
      const l = fromList(sourceSize);
      if (l) return { size: l, source: 'list' };
      return { size: '', source: 'none' };
    },
  };
}

export function sourceSizeOf(attrs: Record<string, string>) {
  return attrs['size-primary-shoes'] || attrs['size-primary-clothing'] || attrs['size-description'] || '';
}
export function isShoeCategory(category: string) { return /^shoes/i.test(category || ''); }

// Default table per marketplace from every UPC matched between Nordstrom and the marketplace — shoes and clothing.
export async function learnDefaults(channelKey: string, kohlsSizeFor?: (row: Record<string, string>) => string | null) {
  const [products, onChannel] = await Promise.all([
    db.product.findMany({ select: { gtin: true, categoryRaw: true, attrs: true } }),
    db.channelProduct.findMany({ where: { channelKey }, select: { upc: true, size: true, raw: true } }),
  ]);
  const byGtin = new Map(products.map((p) => [p.gtin, p]));
  const tally = new Map<string, Map<string, number>>();
  for (const c of onChannel) {
    const p = byGtin.get(c.upc);
    if (!p) continue;
    const src = sourceSizeOf(p.attrs as Record<string, string>);
    const dst = c.size ?? (kohlsSizeFor ? kohlsSizeFor(c.raw as Record<string, string>) ?? '' : '');
    if (!src || !dst) continue;
    const key = `${isShoeCategory(p.categoryRaw ?? '') ? 'shoe' : 'cloth'}:${src}`;
    if (!tally.has(key)) tally.set(key, new Map());
    tally.get(key)!.set(dst, (tally.get(key)!.get(dst) ?? 0) + 1);
  }
  const learned: { sourceSize: string; targetSize: string; count: number; total: number }[] = [];
  for (const [key, m] of tally) {
    const src = key.slice(key.indexOf(':') + 1);
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const [target, count] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    learned.push({ sourceSize: src, targetSize: target, count, total });
  }
  for (const l of learned) {
    const ex = await db.sizeMap.findFirst({ where: { channelKey, styleCode: null, sourceSize: l.sourceSize } });
    if (ex && ex.origin !== 'manual') await db.sizeMap.update({ where: { id: ex.id }, data: { targetSize: l.targetSize, origin: 'learned' } });
    if (!ex) await db.sizeMap.create({ data: { channelKey, styleCode: null, sourceSize: l.sourceSize, targetSize: l.targetSize, origin: 'learned' } });
  }
  return learned.sort((a, b) => num(a.sourceSize) - num(b.sourceSize));
}
