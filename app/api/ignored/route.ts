import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sourceSizeOf } from '@/lib/sizes';
import { short } from '@/lib/errors';

type Row = Record<string, string>;

export async function GET(req: Request) {
  const channel = new URL(req.url).searchParams.get('channel') ?? '';
  try {
    const items = await db.ignoredItem.findMany({ where: { channelKey: channel }, orderBy: { createdAt: 'desc' } });
    const prods = await db.product.findMany({
      where: { gtin: { in: items.map((i) => i.gtin) } },
      select: { gtin: true, images: { take: 1, orderBy: { position: 'asc' }, select: { sourceUrl: true } } },
    });
    const thumbBy = new Map(prods.map((p) => [p.gtin, p.images[0]?.sourceUrl ?? '']));
    const groups = new Map<string, { key: string; title: string; styleCode: string; color: string; thumb: string; at: string; items: { gtin: string; size: string }[] }>();
    for (const i of items) {
      const key = `${i.styleCode}|${i.color}`;
      if (!groups.has(key)) groups.set(key, { key, title: i.title, styleCode: i.styleCode, color: i.color, thumb: thumbBy.get(i.gtin) ?? '', at: i.createdAt.toISOString(), items: [] });
      groups.get(key)!.items.push({ gtin: i.gtin, size: i.size });
    }
    return NextResponse.json({ groups: [...groups.values()] });
  } catch (e) {
    return NextResponse.json({ groups: [], error: `Could not load ignored items — ${short(e)}` }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const channel = body.channel as string;
    const ch = await db.channel.findUnique({ where: { key: channel } });
    if (!ch) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

    if (body.action === 'ignore') {
      const ids = (body.changeIds as string[]) ?? [];
      const changes = await db.pendingChange.findMany({
        where: { id: { in: ids }, channelId: ch.id },
        select: { id: true, product: { select: { gtin: true, sku: true, title: true, color: true, attrs: true } } },
      });
      const ops = changes.map((c) => {
        const a = c.product.attrs as Row;
        const styleCode = a['variant-group-code'] || a['vpn'] || c.product.sku || c.product.gtin;
        const data = { styleCode, color: c.product.color ?? '', title: c.product.title, size: sourceSizeOf(a) };
        return db.ignoredItem.upsert({ where: { channelKey_gtin: { channelKey: channel, gtin: c.product.gtin } }, update: data, create: { channelKey: channel, gtin: c.product.gtin, ...data } });
      });
      for (let i = 0; i < ops.length; i += 100) await db.$transaction(ops.slice(i, i + 100));
      await db.pendingChange.updateMany({ where: { id: { in: changes.map((c) => c.id) } }, data: { approval: 'ignored', decidedAt: new Date() } });
      await log("approval", "Ignored " + changes.length + " sizes on " + channel);
      return NextResponse.json({ ok: true, count: changes.length });
    }

    if (body.action === 'revert') {
      const gtins = (body.gtins as string[]) ?? [];
      await db.ignoredItem.deleteMany({ where: { channelKey: channel, gtin: { in: gtins } } });
      const products = await db.product.findMany({ where: { gtin: { in: gtins } }, select: { id: true } });
      const back = await db.pendingChange.updateMany({
        where: { channelId: ch.id, productId: { in: products.map((p) => p.id) }, approval: 'ignored' },
        data: { approval: 'pending', decidedAt: null },
      });
      await log("approval", "Reverted " + gtins.length + " ignored sizes on " + channel);
      return NextResponse.json({ ok: true, count: gtins.length, requeued: back.count });
    }

    return NextResponse.json({ error: 'action must be ignore or revert' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: `Could not save — ${short(e)}` }, { status: 503 });
  }
}
