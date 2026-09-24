import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { getGroups } from '@/lib/groups-cache';
import { channelColumns, OFFER_COLUMNS } from '@/lib/channel-specs';
import { getColumnSpecs } from '@/lib/static-data';
import { short } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { channel, changeIds } = await req.json();
    const spec = channelColumns[channel];
    if (!spec || !Array.isArray(changeIds)) return NextResponse.json({ error: 'channel and changeIds required' }, { status: 400 });

    const tpls = (await db.setting.findMany({ where: { key: { startsWith: `template:${channel}:` } } })).map((t) => t.value as { codes: string[]; categories: string[] });
    if (!tpls.length) return NextResponse.json({ error: `No spec file loaded for ${channel}. Import one first.` }, { status: 400 });
    const label = new Map((await getColumnSpecs(channel)).map((s) => [s.code, s.label]));

    const want = new Set(changeIds as string[]);
    const groups = await getGroups(channel);
    const picked = groups.flatMap((g) => g.sizes.filter((s) => want.has(s.changeId)).map((s) => ({ row: s.outputRow, category: s.outputRow[spec.category] ?? '' })));
    if (!picked.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 });

    // One sheet per template family, product columns only, in the marketplace's own order.
    const byTpl = new Map<number, Record<string, string>[]>();
    for (const p of picked) {
      let idx = tpls.findIndex((t) => t.categories.includes(p.category));
      if (idx < 0) idx = 0;
      if (!byTpl.has(idx)) byTpl.set(idx, []);
      byTpl.get(idx)!.push(p.row);
    }
    const wb = XLSX.utils.book_new();
    for (const [idx, rows] of byTpl) {
      const codes = tpls[idx].codes.filter((c) => c && !OFFER_COLUMNS.has(c));
      const grid: string[][] = [codes.map((c) => label.get(c) ?? c), codes, ...rows.map((r) => codes.map((c) => r[c] ?? ''))];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), byTpl.size === 1 ? 'Data' : `Data ${idx + 1}`);
    }
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${channel}-${picked.length}-rows-${stamp}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not build the file — ${short(e)}` }, { status: 503 });
  }
}
