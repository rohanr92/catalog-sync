import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getChannelProducts } from '@/lib/static-data';
import { groupKeyOf } from '@/lib/channel-catalog';
import { log } from '@/lib/log';
import { short } from '@/lib/errors';

type Row = Record<string, string>;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === 'save') {
      const { channel, key } = body;
      const rows = (await getChannelProducts(channel)).filter((r) => groupKeyOf(r as never) === key) as { upc: string; title: string | null; color: string | null }[];
      if (!rows.length) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      const open = await db.channelEdit.findFirst({ where: { channelKey: channel, groupKey: key, status: { in: ['draft', 'approved', 'rejected'] } } });
      const fields: Record<string, Row> = { ...((open?.fields as Record<string, Row>) ?? {}) };
      for (const [k, v] of Object.entries((body.fields ?? {}) as Record<string, Row>)) fields[k] = { ...(fields[k] ?? {}), ...v };
      const data = { title: rows[0].title ?? '', color: rows[0].color ?? '', upcs: rows.map((r) => r.upc), images: Array.isArray(body.images) ? body.images : ((open?.images as string[]) ?? []), fields, status: 'draft', sendError: null };
      const saved = open ? await db.channelEdit.update({ where: { id: open.id }, data }) : await db.channelEdit.create({ data: { channelKey: channel, groupKey: key, ...data } });
      await log('approval', `${channel} product edit saved: ${saved.title} ${saved.color}`);
      return NextResponse.json({ ok: true, edit: saved });
    }
    if (body.action === 'approve') {
      const e = await db.channelEdit.update({ where: { id: body.id }, data: { status: 'approved', submissionId: null } });
      await log('approval', `${e.channelKey} product edit approved: ${e.title} ${e.color}`);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'discard') { await db.channelEdit.delete({ where: { id: body.id } }); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: short(e) }, { status: 503 }); }
}
