import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelColumns, OFFER_COLUMNS } from '@/lib/channel-specs';
import { getColumnSpecs } from '@/lib/static-data';
import { finalImages } from '@/lib/image-changes';
import { findReusableSwatch } from '@/lib/swatch';
import { short } from '@/lib/errors';

type Row = Record<string, string>;

// The exact rows an image change will send: the marketplace's own row per size, image columns (and a missing swatch) replaced.
export async function GET(req: Request) {
  try {
    const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean);
    const items = await db.imageChange.findMany({ where: { id: { in: ids } } });
    if (!items.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 404 });
    const channel = items[0].channelKey;
    const spec = channelColumns[channel];
    const rows: { upc: string; size: string; title: string; color: string; category: string; values: Row; changed: string[] }[] = [];
    for (const it of items.filter((i) => i.channelKey === channel)) {
      const set = finalImages(it, spec.images.length);
      const sw = spec.swatch ? await findReusableSwatch(it.styleCode, it.color) : null;
      const cps = await db.channelProduct.findMany({ where: { channelKey: channel, upc: { in: it.gtins as string[] } }, select: { upc: true, raw: true, category: true, size: true } });
      for (const cp of cps) {
        const raw = cp.raw as Row, row: Row = { ...raw }, changed: string[] = [];
        spec.images.forEach((col, i) => { const v = set[i] ?? ''; if ((raw[col] ?? '') !== v) changed.push(col); row[col] = v; });
        if (spec.swatch && !row[spec.swatch]) { row[spec.swatch] = sw ?? ''; changed.push(spec.swatch); }
        rows.push({ upc: cp.upc, size: cp.size ?? '', title: it.title, color: it.color, category: cp.category ?? '', values: row, changed });
      }
    }
    const tpls = (await db.setting.findMany({ where: { key: { startsWith: `template:${channel}:` } } })).map((t) => t.value as { codes: string[]; categories: string[] });
    const cats = new Set(rows.map((r) => r.category));
    let codes: string[] = [];
    for (const t of tpls) if ([...cats].some((c) => t.categories.includes(c))) for (const c of t.codes) if (c && !OFFER_COLUMNS.has(c) && !codes.includes(c)) codes.push(c);
    if (!codes.length && rows[0]) codes = Object.keys(rows[0].values).filter((c) => !OFFER_COLUMNS.has(c));
    const label = new Map((await getColumnSpecs(channel)).map((s) => [s.code, s.label]));
    return NextResponse.json({
      channel, rows,
      columns: codes.map((code) => ({ code, label: label.get(code) ?? code })),
      swatchMissing: !!spec.swatch && rows.some((r) => !r.values[spec.swatch!]),
    });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
