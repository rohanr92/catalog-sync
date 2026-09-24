import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { upcCheck } from '@/lib/upc-check';
import { sourceSizeOf } from '@/lib/sizes';
import { log } from '@/lib/log';
import { short } from '@/lib/errors';

type Row = Record<string, string>;

export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get('channel') ?? '';
  try { return NextResponse.json(await upcCheck(channel)); }
  catch (e) { return NextResponse.json({ error: short(e) }, { status: 503 }); }
}

// Keep Nordstrom UPCs out of a marketplace's queue (so a mismatch doesn't become a duplicate listing).
export async function POST(req: Request) {
  try {
    const { action, channel, gtins } = await req.json();
    if (action !== 'ignore' || !Array.isArray(gtins) || !gtins.length) return NextResponse.json({ error: 'nothing to do' }, { status: 400 });
    const ch = await db.channel.findUnique({ where: { key: channel } });
    if (!ch) return NextResponse.json({ error: 'unknown marketplace' }, { status: 400 });
    const products = await db.product.findMany({ where: { gtin: { in: gtins } }, select: { id: true, gtin: true, sku: true, title: true, color: true, attrs: true } });
    for (const p of products) {
      const a = p.attrs as Row;
      const data = { styleCode: a['variant-group-code'] || a['vpn'] || p.sku || p.gtin, color: p.color ?? '', title: p.title, size: sourceSizeOf(a) };
      await db.ignoredItem.upsert({ where: { channelKey_gtin: { channelKey: channel, gtin: p.gtin } }, update: data, create: { channelKey: channel, gtin: p.gtin, ...data } });
    }
    await db.pendingChange.updateMany({ where: { channelId: ch.id, approval: 'pending', productId: { in: products.map((p) => p.id) } }, data: { approval: 'ignored', decidedAt: new Date() } });
    await log('approval', `UPC check: kept ${products.length} Nordstrom UPCs out of the ${channel} queue`);
    return NextResponse.json({ ok: true, count: products.length });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
