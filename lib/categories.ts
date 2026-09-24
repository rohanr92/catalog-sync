import { db } from './db';
import { channelColumns } from './channel-specs';

const tokens = (s: string) => (s || '').toLowerCase().replace(/women'?s?|womens|female|ladies/g, 'w').split(/[^a-z0-9]+/).filter((t) => t.length > 1);

export function suggestCategories(source: string, candidates: string[], n = 5): string[] {
  const src = new Set(tokens(source));
  const last = tokens(source.split('/').pop() ?? '');
  return candidates
    .map((c) => {
      const ct = tokens(c);
      const overlap = ct.filter((t) => src.has(t)).length;
      const lastHit = last.some((t) => ct.includes(t)) ? 2 : 0;
      const sameLeaf = (c.split('/').pop() ?? '').toLowerCase() === (source.split('/').pop() ?? '').toLowerCase() ? 3 : 0;
      return { c, score: overlap + lastHit + sameLeaf };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.c);
}

export async function channelCategoryList(channelKey: string): Promise<string[]> {
  const spec = channelColumns[channelKey];
  const vl = await db.valueList.findUnique({ where: { channelKey_attribute: { channelKey, attribute: spec.category } } });
  const fromList = (vl?.values as string[]) ?? [];
  if (fromList.length) return fromList;
  const rows = await db.channelProduct.findMany({ where: { channelKey }, select: { category: true }, distinct: ['category'] });
  return rows.map((r) => r.category).filter(Boolean) as string[];
}

export async function learnCategoryMaps(channelKey: string) {
  const ch = await db.channel.findUnique({ where: { key: channelKey } });
  if (!ch) return 0;
  const [products, onChannel] = await Promise.all([
    db.product.findMany({ select: { gtin: true, categoryRaw: true } }),
    db.channelProduct.findMany({ where: { channelKey }, select: { upc: true, category: true } }),
  ]);
  const catByGtin = new Map(products.map((p) => [p.gtin, p.categoryRaw ?? '']));
  const tally = new Map<string, Map<string, number>>();
  for (const c of onChannel) {
    const src = catByGtin.get(c.upc);
    if (!src || !c.category) continue;
    if (!tally.has(src)) tally.set(src, new Map());
    tally.get(src)!.set(c.category, (tally.get(src)!.get(c.category) ?? 0) + 1);
  }
  let n = 0;
  for (const [src, m] of tally) {
    const [best] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const ex = await db.categoryMap.findUnique({ where: { channelId_fromCategory: { channelId: ch.id, fromCategory: src } } });
    if (ex && (ex.requiredAttrs as { origin?: string })?.origin === 'manual') continue;
    await db.categoryMap.upsert({
      where: { channelId_fromCategory: { channelId: ch.id, fromCategory: src } },
      update: { toCategory: best, requiredAttrs: { origin: 'learned' } },
      create: { channelId: ch.id, fromCategory: src, toCategory: best, requiredAttrs: { origin: 'learned' } },
    });
    n++;
  }
  return n;
}
