import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { baseCode, norm } from '@/lib/attributes';

function suggest(value: string, allowed: string[], n = 5): string[] {
  const nv = norm(value);
  const toks = new Set(nv.split(' '));
  return allowed
    .map((a) => { const na = norm(a); let s = 0; if (na === nv) s = 10; else if (na.startsWith(nv) || nv.startsWith(na)) s = 5; else s = na.split(' ').filter((t) => toks.has(t)).length; return { a, s }; })
    .filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, n).map((x) => x.a);
}

export async function GET(req: Request) {
  const channelKey = new URL(req.url).searchParams.get('channel') ?? '';
  const [specs, maps, vmaps, lists, products] = await Promise.all([
    db.columnSpec.findMany({ where: { channelKey } }),
    db.attributeMap.findMany({ where: { channelKey } }),
    db.attrValueMap.findMany({ where: { channelKey } }),
    db.valueList.findMany({ where: { channelKey } }),
    db.product.findMany({ select: { attrs: true } }),
  ]);
  const listBy = new Map(lists.map((l) => [l.attribute, l.values as string[]]));
  const vmapBy = new Map(vmaps.map((v) => [`${v.channelCode}|${v.fromValue}`, v]));
  const labelBy = new Map<string, string>();
  for (const s of specs) { const bc = baseCode(channelKey, s.code); if (!labelBy.has(bc)) labelBy.set(bc, s.label.replace(/\s*-\s*\d+(_\d+)+$/, '')); }

  const columns = [];
  for (const m of maps) {
    // allowed list: the column itself, or (Kohl's) the union across its category-suffixed variants
    const allowed = [...new Set(specs.filter((s) => baseCode(channelKey, s.code) === m.channelCode).flatMap((s) => listBy.get(s.code) ?? []))];
    if (!allowed.length) continue;
    const seen = new Map<string, number>();
    for (const p of products) { const v = (p.attrs as Record<string, string>)[m.nordstromCode]; if (v) seen.set(v, (seen.get(v) ?? 0) + 1); }
    if (!seen.size) continue;
    const allowedNorm = new Map(allowed.map((a) => [norm(a), a]));
    const values = [...seen.entries()].map(([from, count]) => {
      const vm = vmapBy.get(`${m.channelCode}|${from}`);
      let to = '', origin = 'none';
      if (vm) { to = vm.toValue; origin = vm.origin; }
      else if (allowed.includes(from)) { to = from; origin = 'exact'; }
      else if (allowedNorm.has(norm(from))) { to = allowedNorm.get(norm(from))!; origin = 'exact'; }
      else { const s = suggest(from, allowed, 2); if (s.length === 1 || (s.length > 1 && norm(s[0]).startsWith(norm(from)))) { to = s[0]; origin = 'closest'; } }
      return { from, count, to, origin, suggestions: suggest(from, allowed) };
    }).sort((a, b) => (a.to ? 1 : 0) - (b.to ? 1 : 0) || b.count - a.count);
    columns.push({ channelCode: m.channelCode, label: labelBy.get(m.channelCode) ?? m.channelCode, nordstromCode: m.nordstromCode, allowed, values, missing: values.filter((v) => !v.to).length });
  }
  columns.sort((a, b) => b.missing - a.missing || a.label.localeCompare(b.label));
  return NextResponse.json({ columns });
}

export async function POST(req: Request) {
  const { channel, channelCode, fromValue, toValue } = await req.json();
  if (!channel || !channelCode || !fromValue) return NextResponse.json({ error: 'channel, channelCode, fromValue required' }, { status: 400 });
  if (!toValue) { await db.attrValueMap.deleteMany({ where: { channelKey: channel, channelCode, fromValue } }); return NextResponse.json({ ok: true, removed: true }); }
  await db.attrValueMap.upsert({ where: { channelKey_channelCode_fromValue: { channelKey: channel, channelCode, fromValue } }, update: { toValue, origin: 'manual' }, create: { channelKey: channel, channelCode, fromValue, toValue, origin: 'manual' } });
  return NextResponse.json({ ok: true });
}
