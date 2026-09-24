import { OFFER_COLUMNS } from "@/lib/channel-specs";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { learnAttributes, baseCode, isOpsColumn } from "@/lib/attributes";
import { seedBuiltinMaps } from '@/lib/builtin-maps';
import { learnCategoryMaps } from '@/lib/categories';
import { learnDefaults } from '@/lib/sizes';
import { kohlsSizeFor, channelColumns, textColumns } from '@/lib/channel-specs';

export const maxDuration = 300;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const channelKey = u.searchParams.get('channel') ?? '';
  const category = u.searchParams.get('category') ?? '';
  const [specs, maps, defaults, lists, nord] = await Promise.all([
    db.columnSpec.findMany({ where: { channelKey } }).then((r) => r.filter((s) => !OFFER_COLUMNS.has(s.code))),
    db.attributeMap.findMany({ where: { channelKey } }),
    db.categoryDefault.findMany({ where: { channelKey } }),
    db.valueList.findMany({ where: { channelKey }, select: { attribute: true, values: true } }),
    db.columnSpec.findMany({ where: { channelKey: 'nordstrom' }, select: { code: true, label: true } }),
  ]);
  const categories = [...new Set(specs.flatMap((c) => Object.keys(c.requiredBy as object)))].sort();
  const mapBy = new Map(maps.map((m) => [m.channelCode, m]));
  const listBy = new Map(lists.map((l) => [l.attribute, (l.values as string[]).length]));
  const s0 = channelColumns[channelKey];
  const tx = textColumns[channelKey];
  const fixed = new Set([s0?.upc, s0?.altUpc, s0?.sku, s0?.style, s0?.category, s0?.title, s0?.color, s0?.size, s0?.swatch, tx?.description, tx?.brand, ...(s0?.images ?? [])].filter(Boolean) as string[]);
  const isFixed = (code: string, label = "", description = "") => isOpsColumn(code, label, description) || fixed.has(code) || (channelKey === 'kohls' && (/^nrf_size-/.test(code) || /^feature_/.test(code))) || (channelKey === 'macys' && /^fnb\d/.test(code));

  if (category) {
    const defBy = new Map(defaults.filter((d) => d.category === category).map((d) => [d.code, d]));
    const rows = specs
      .filter((s) => ['REQUIRED', 'OPTIONAL'].includes((s.requiredBy as Record<string, string>)[category]))
      .map((s) => {
        const bc = baseCode(channelKey, s.code); const m = mapBy.get(bc);
        return { code: s.code, base: bc, label: s.label, fixed: isFixed(s.code, s.label, s.description ?? ""), required: (s.requiredBy as Record<string, string>)[category] === 'REQUIRED', requiredIn: 0, usedIn: 0,
          source: m?.nordstromCode ?? '', origin: m?.origin ?? '', confidence: m?.confidence ?? 0, defaultValue: defBy.get(s.code)?.value ?? '', allowedCount: listBy.get(s.code) ?? 0, example: s.example ?? '' };
      })
      .sort((a, b) => Number(b.required) - Number(a.required) || a.label.localeCompare(b.label));
    return NextResponse.json({ rows, categories, nordstromAttrs: nord.sort((a, b) => a.label.localeCompare(b.label)) });
  }

  // All categories: one row per base column.
  const agg = new Map<string, { code: string; base: string; label: string; fixed: boolean; requiredIn: number; usedIn: number; hasDefault: number; allowedCount: number; example: string }>();
  const globalDef = new Map(defaults.filter((d) => d.category === "*").map((d) => [d.code, d.value]));
  const defaultCodes = new Set(defaults.filter((d) => d.category !== "*").map((d) => baseCode(channelKey, d.code)));
  for (const s of specs) {
    const bc = baseCode(channelKey, s.code);
    const req = s.requiredBy as Record<string, string>;
    const requiredIn = Object.values(req).filter((v) => v === 'REQUIRED').length;
    const usedIn = Object.values(req).filter((v) => v === 'REQUIRED' || v === 'OPTIONAL').length;
    const cur = agg.get(bc) ?? { code: s.code, base: bc, label: s.label.replace(/\s*-\s*\d+(_\d+)+$/, ''), fixed: isFixed(s.code, s.label, s.description ?? ""), requiredIn: 0, usedIn: 0, hasDefault: defaultCodes.has(bc) ? 1 : 0, allowedCount: 0, example: s.example ?? '' };
    cur.requiredIn += requiredIn; cur.usedIn += usedIn;
    cur.allowedCount = Math.max(cur.allowedCount, listBy.get(s.code) ?? 0);
    agg.set(bc, cur);
  }
  const rows = [...agg.values()].map((a) => {
    const m = mapBy.get(a.base);
    return { ...a, required: a.requiredIn > 0, source: m?.nordstromCode ?? '', origin: m?.origin ?? '', confidence: m?.confidence ?? 0, defaultValue: globalDef.get(a.base) ?? "", perCategory: a.hasDefault };
  }).sort((a, b) => Number(b.required) - Number(a.required) || b.requiredIn - a.requiredIn || a.label.localeCompare(b.label));
  return NextResponse.json({ rows, categories, nordstromAttrs: nord.sort((a, b) => a.label.localeCompare(b.label)) });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (body.learnEverything) {
    const conns = await db.channelConnection.findMany({ where: { enabled: true, lastTestOk: true } });
    const out: Record<string, unknown> = {};
    for (const c of conns) {
      if (c.channelKey === 'nordstrom') continue;
      const builtins = await seedBuiltinMaps(c.channelKey);
      const categories = await learnCategoryMaps(c.channelKey);
      const sizes = (await learnDefaults(c.channelKey, c.channelKey === 'kohls' ? kohlsSizeFor : undefined)).length;
      const attrs = await learnAttributes(c.channelKey);
      out[c.channelKey] = { builtins, categories, sizes, ...attrs };
    }
    return NextResponse.json(out);
  }

  const { channel } = body;
  if (!channel) return NextResponse.json({ error: 'channel required' }, { status: 400 });

  if (body.setSource !== undefined) {
    const channelCode = body.channelCode as string;
    if (!body.setSource) { await db.attributeMap.deleteMany({ where: { channelKey: channel, channelCode } }); return NextResponse.json({ ok: true, removed: true }); }
    await db.attributeMap.upsert({ where: { channelKey_channelCode: { channelKey: channel, channelCode } }, update: { nordstromCode: body.setSource, origin: 'manual', confidence: 1 }, create: { channelKey: channel, channelCode, nordstromCode: body.setSource, origin: 'manual', confidence: 1 } });
    return NextResponse.json({ ok: true });
  }

  if (body.setDefault !== undefined) {
    const category = (body.category as string) || "*";
    const code = body.code as string;
    if (!body.setDefault) { await db.categoryDefault.deleteMany({ where: { channelKey: channel, category, code } }); return NextResponse.json({ ok: true, removed: true }); }
    await db.categoryDefault.upsert({ where: { channelKey_category_code: { channelKey: channel, category, code } }, update: { value: body.setDefault, share: 1 }, create: { channelKey: channel, category, code, value: body.setDefault, share: 1 } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'nothing to do' }, { status: 400 });
}
