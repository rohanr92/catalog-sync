import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { channelColumns, OFFER_COLUMNS } from '@/lib/channel-specs';
import { getColumnSpecs } from '@/lib/static-data';
import { finalImages } from '@/lib/image-changes';
import { short } from '@/lib/errors';

export const runtime = 'nodejs';
type Row = Record<string, string>;

export async function POST(req: Request) {
  try {
    const { ids } = await req.json();
    const items = await db.imageChange.findMany({ where: { id: { in: ids ?? [] } } });
    if (!items.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 });
    const channel = items[0].channelKey;
    if (items.some((i) => i.channelKey !== channel)) return NextResponse.json({ error: 'One marketplace at a time' }, { status: 400 });
    const spec = channelColumns[channel];

    const tpls = (await db.setting.findMany({ where: { key: { startsWith: `template:${channel}:` } } })).map((t) => t.value as { codes: string[]; categories: string[] });
    const label = new Map((await getColumnSpecs(channel)).map((s) => [s.code, s.label]));

    // The marketplace's own existing row for every UPC, with only the image columns replaced.
    const picked: { row: Row; category: string }[] = [];
    for (const it of items) {
      const set = finalImages(it, spec.images.length);
      const cps = await db.channelProduct.findMany({ where: { channelKey: channel, upc: { in: it.gtins as string[] } }, select: { raw: true, category: true } });
      for (const cp of cps) {
        const row = { ...(cp.raw as Row) };
        spec.images.forEach((col, i) => { row[col] = set[i] ?? ''; });
        picked.push({ row, category: cp.category ?? '' });
      }
    }
    if (!picked.length) return NextResponse.json({ error: 'None of these UPCs are in the last marketplace import' }, { status: 400 });

    const wb = XLSX.utils.book_new();
    const byTpl = new Map<number, Row[]>();
    for (const p of picked) { let idx = tpls.findIndex((t) => t.categories.includes(p.category)); if (idx < 0) idx = 0; if (!byTpl.has(idx)) byTpl.set(idx, []); byTpl.get(idx)!.push(p.row); }
    for (const [idx, rows] of byTpl) {
      const codes = (tpls[idx]?.codes ?? Object.keys(rows[0])).filter((c) => c && !OFFER_COLUMNS.has(c));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([codes.map((c) => label.get(c) ?? c), codes, ...rows.map((r) => codes.map((c) => r[c] ?? ''))]), byTpl.size === 1 ? 'Data' : `Data ${idx + 1}`);
    }
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${channel}-image-updates-${picked.length}-rows-${stamp}.xlsx"` } });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
