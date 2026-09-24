import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProducts } from '@/lib/static-data';
import { log } from '@/lib/log';
import { short } from '@/lib/errors';

type Row = Record<string, string>;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.action === 'save') {
      const { styleCode, color } = body;
      const products = (await getProducts()).filter((p) => (((p.attrs as Row)['variant-group-code'] || (p.attrs as Row)['vpn'] || p.sku || p.gtin) === styleCode) && (p.color ?? '') === color);
      if (!products.length) return NextResponse.json({ error: 'Colour not found' }, { status: 404 });
      const open = await db.nordstromEdit.findFirst({ where: { styleCode, color, status: { in: ['draft', 'approved', 'rejected'] } } });
      const fields: Record<string, Row> = { ...((open?.fields as Record<string, Row>) ?? {}) };
      for (const [k, v] of Object.entries((body.fields ?? {}) as Record<string, Row>)) fields[k] = { ...(fields[k] ?? {}), ...v };
      const data = {
        title: products[0].title, gtins: products.map((p) => p.gtin),
        images: Array.isArray(body.images) ? body.images : ((open?.images as string[]) ?? []),
        fields, status: 'draft', sendError: null,
      };
      const saved = open ? await db.nordstromEdit.update({ where: { id: open.id }, data }) : await db.nordstromEdit.create({ data: { styleCode, color, ...data } });
      await log("approval", "Nordstrom edit saved: " + saved.title + " " + saved.color);
      return NextResponse.json({ ok: true, edit: saved });
    }
    if (body.action === 'approve') {
      const e = await db.nordstromEdit.update({ where: { id: body.id }, data: { status: 'approved' } });
      await log('settings', `Nordstrom edit approved: ${e.title} ${e.color}`);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'discard') {
      await db.nordstromEdit.delete({ where: { id: body.id } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
