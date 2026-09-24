import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getGroups } from '@/lib/groups-cache';
import { channelColumns, OFFER_COLUMNS } from '@/lib/channel-specs';
import { getColumnSpecs, getValueLists } from '@/lib/static-data';
import { short } from '@/lib/errors';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const channel = u.searchParams.get('channel') ?? '';
  const ids = (u.searchParams.get('ids') ?? '').split(',').filter(Boolean);
  const spec = channelColumns[channel];
  if (!spec) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

  try {
    const [groups, tpls, specs, overrides, lists] = await Promise.all([
      getGroups(channel),
      db.setting.findMany({ where: { key: { startsWith: `template:${channel}:` } } }),
      getColumnSpecs(channel),
      db.rowOverride.findMany({ where: { changeId: { in: ids } } }),
      getValueLists(channel),
    ]);
    const want = new Set(ids);
    const rows = groups.flatMap((g) => g.sizes.filter((s) => want.has(s.changeId)).map((s) => ({ changeId: s.changeId, title: g.title, color: g.color, size: s.size, category: s.outputRow[spec.category] ?? '', values: { ...s.outputRow } })));
    const ovBy = new Map(overrides.map((o) => [o.changeId, o.values as Record<string, string>]));
    for (const r of rows) Object.assign(r.values, ovBy.get(r.changeId) ?? {});

    // Product columns only, in the marketplace's own order.
    const templates = tpls.map((t) => t.value as { codes: string[]; categories: string[] });
    const cats = new Set(rows.map((r) => r.category));
    let codes: string[] = [];
    for (const t of templates) if ([...cats].some((c) => t.categories.includes(c))) for (const c of t.codes) if (c && !OFFER_COLUMNS.has(c) && !codes.includes(c)) codes.push(c);
    if (!codes.length) codes = (templates[0]?.codes ?? []).filter((c) => c && !OFFER_COLUMNS.has(c));

    const specBy = new Map(specs.map((s) => [s.code, s]));
    const listBy = new Map(lists.map((l) => [l.attribute, l.values as string[]]));
    const columns = codes.map((code) => {
      const s = specBy.get(code);
      const req = (s?.requiredBy as Record<string, string>) ?? {};
      return {
        code, label: s?.label ?? code,
        required: [...cats].some((c) => req[c] === 'REQUIRED'),
        used: [...cats].some((c) => req[c] === 'REQUIRED' || req[c] === 'OPTIONAL'),
        example: s?.example ?? '',
        allowed: listBy.get(code) ?? [],
      };
    });
    return NextResponse.json({ columns, rows });
  } catch (e) {
    return NextResponse.json({ error: `Could not build the sheet — ${short(e)}` }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const { edits } = await req.json();
    if (!edits || typeof edits !== 'object') return NextResponse.json({ error: 'edits required' }, { status: 400 });
    const ops = [];
    for (const [changeId, values] of Object.entries(edits as Record<string, Record<string, string>>)) {
      const existing = await db.rowOverride.findUnique({ where: { changeId } });
      const merged = { ...((existing?.values as Record<string, string>) ?? {}), ...values };
      ops.push(db.rowOverride.upsert({ where: { changeId }, update: { values: merged }, create: { changeId, values: merged } }));
    }
    for (let i = 0; i < ops.length; i += 100) await db.$transaction(ops.slice(i, i + 100));
    await log("approval", "Sheet edits saved on " + ops.length + " rows");
    return NextResponse.json({ ok: true, rows: ops.length });
  } catch (e) {
    return NextResponse.json({ error: `Could not save — ${short(e)}` }, { status: 503 });
  }
}
