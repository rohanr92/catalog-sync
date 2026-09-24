import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProducts, getColumnSpecs, getValueLists } from '@/lib/static-data';
import { sourceSizeOf } from '@/lib/sizes';
import { OFFER_COLUMNS } from '@/lib/channel-specs';
import { short } from '@/lib/errors';

type Row = Record<string, string>;
const styleOf = (p: { sku: string | null; gtin: string; attrs: unknown }) => (p.attrs as Row)['variant-group-code'] || (p.attrs as Row)['vpn'] || p.sku || p.gtin;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get('key');
  try {
    const products = await getProducts();

    if (key) {
      // One colour: every size's full Nordstrom row, the Nordstrom columns, and any open edit.
      const [style, color] = key.split('|');
      const rows = products.filter((p) => styleOf(p) === style && (p.color ?? '') === color);
      if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const cat = rows[0].categoryRaw ?? '';
      const [tplRows, specs, lists, edit] = await Promise.all([
        db.setting.findMany({ where: { key: { startsWith: 'template:nordstrom:' } } }),
        getColumnSpecs('nordstrom'),
        getValueLists('nordstrom'),
        db.nordstromEdit.findFirst({ where: { styleCode: style, color, status: { in: ['draft', 'approved', 'sent', 'rejected'] } }, orderBy: { updatedAt: 'desc' } }),
      ]);
      const tpl = tplRows.map((t) => t.value as { codes: string[]; categories: string[] }).find((t) => t.categories.includes(cat)) ?? (tplRows[0]?.value as { codes: string[] } | undefined);
      const specBy = new Map(specs.map((s) => [s.code, s]));
      const listBy = new Map(lists.map((l) => [l.attribute, l.values as string[]]));
      const columns = (tpl?.codes ?? Object.keys(rows[0].attrs as Row)).filter((c) => c && !OFFER_COLUMNS.has(c)).map((code) => {
        const req = (specBy.get(code)?.requiredBy as Row) ?? {};
        return { code, label: specBy.get(code)?.label ?? code, required: req[cat] === 'REQUIRED', used: req[cat] === 'REQUIRED' || req[cat] === 'OPTIONAL', allowed: listBy.get(code) ?? [] };
      });
      return NextResponse.json({
        styleCode: style, color, title: rows[0].title, category: cat,
        images: rows[0].images.map((i) => i.sourceUrl),
        sizes: rows.map((p) => ({ gtin: p.gtin, sku: p.sku, size: sourceSizeOf(p.attrs as Row), values: p.attrs as Row })),
        columns, edit,
      });
    }

    // All colours.
    const q = (u.searchParams.get('q') ?? '').trim().toLowerCase();
    const groups = new Map<string, { key: string; styleCode: string; color: string; title: string; category: string; thumb: string; images: number; sizes: string[]; gtins: string[] }>();
    for (const p of products) {
      const k = `${styleOf(p)}|${p.color ?? ''}`;
      if (!groups.has(k)) groups.set(k, { key: k, styleCode: styleOf(p), color: p.color ?? '', title: p.title, category: p.categoryRaw ?? '', thumb: p.images[0]?.sourceUrl ?? '', images: p.images.length, sizes: [], gtins: [] });
      const g = groups.get(k)!;
      g.sizes.push(sourceSizeOf(p.attrs as Row));
      g.gtins.push(p.gtin);
    }
    const edits = await db.nordstromEdit.findMany({ where: { status: { in: ['draft', 'approved', 'sent', 'rejected'] } }, select: { styleCode: true, color: true, status: true } });
    const editBy = new Map(edits.map((e) => [`${e.styleCode}|${e.color}`, e.status]));
    let list = [...groups.values()].map((g) => ({ ...g, edit: editBy.get(g.key) ?? null }));
    if (q) list = list.filter((g) => `${g.title} ${g.styleCode} ${g.color} ${g.gtins.join(' ')}`.toLowerCase().includes(q));
    list.sort((a, b) => a.title.localeCompare(b.title) || a.color.localeCompare(b.color));
    return NextResponse.json({ total: list.length, products: products.length, groups: list });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
