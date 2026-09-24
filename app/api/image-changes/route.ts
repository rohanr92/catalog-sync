import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelColumns } from '@/lib/channel-specs';
import { proposedImages } from '@/lib/image-changes';
import { uploadToShopify } from '@/lib/shopify-upload';
import { short } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 300;
const clean = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function GET(req: Request) {
  const u = new URL(req.url);
  try {
    if (u.searchParams.get('counts')) {
      const g = await db.imageChange.groupBy({ by: ['channelKey'], where: { status: 'pending' }, _count: { _all: true } });
      return NextResponse.json(Object.fromEntries(g.map((x) => [x.channelKey, x._count._all])));
    }
    const channel = u.searchParams.get('channel') ?? '';
    const status = u.searchParams.get('status') ?? 'pending';
    const slots = channelColumns[channel]?.images.length ?? 8;
    const awaiting = new Set((((await db.setting.findUnique({ where: { key: "nordstromPull" } }))?.value as { awaitingFinal?: number[] } | undefined)?.awaitingFinal ?? []).map(String));
    const rows = await db.imageChange.findMany({ where: { channelKey: channel, status }, orderBy: { detectedAt: 'desc' } });
    const items = rows.map((r) => ({
      id: r.id, sendError: r.sendError, processing: !!r.originImport && awaiting.has(r.originImport), styleCode: r.styleCode, color: r.color, title: r.title, category: r.category, status: r.status, source: r.source,
      detectedAt: r.detectedAt.toISOString(), gtins: r.gtins as string[], positions: r.positions as number[],
      oldImages: r.oldImages as string[], newImages: r.newImages as string[], images: r.images as string[],
      proposed: proposedImages(r.oldImages as string[], r.newImages as string[], r.positions as number[], slots),
    }));
    return NextResponse.json({ items, slots });
  } catch (e) {
    return NextResponse.json({ items: [], slots: 0, error: `Could not load image changes — ${short(e)}` }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, ids, id, images } = await req.json();

    if (action === 'setImages') {
      await db.imageChange.update({ where: { id }, data: { images } });
      return NextResponse.json({ ok: true });
    }

    const items = await db.imageChange.findMany({ where: { id: { in: ids ?? [] } } });

    if (action === 'reject') {
      await db.imageChange.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { status: 'rejected', decidedAt: new Date() } });
      await log("approval", "Image changes " + action + ": " + items.length + " colour(s)");
      return NextResponse.json({ ok: true, count: items.length });
    }
    if (action === 'restore') {
      await db.imageChange.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { status: 'pending', decidedAt: null } });
      await log("approval", "Image changes " + action + ": " + items.length + " colour(s)");
      return NextResponse.json({ ok: true, count: items.length });
    }
    if (action === 'approve') {
      let rehosted = 0;
      for (const it of items) {
        const slots = channelColumns[it.channelKey]?.images.length ?? 8;
        const positions = it.positions as number[];
        const edited = (it.images as string[]) ?? [];
        const set = edited.length ? edited : proposedImages(it.oldImages as string[], it.newImages as string[], positions, slots);
        const out: string[] = [];
        for (let i = 0; i < set.length; i++) {
          const url = set[i];
          // Changed slots that are still Nordstrom links get re-hosted on Shopify with your naming.
          if (url && positions.includes(i + 1) && !/cdn\.shopify\.com/.test(url)) {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`Could not download image ${i + 1} of ${it.title} ${it.color}`);
            out.push(await uploadToShopify(Buffer.from(await r.arrayBuffer()), `${clean(it.category.split('/').pop() ?? '')}_${clean(it.styleCode)}_${clean(it.color)}_${i + 1}`, 'jpeg'));
            rehosted++;
          } else out.push(url);
        }
        await db.imageChange.update({ where: { id: it.id }, data: { images: out, status: "approved", decidedAt: new Date(), submissionId: null, sendStatus: null, sendError: null } });
      }
      await log("approval", "Image changes " + action + ": " + items.length + " colour(s)");
      return NextResponse.json({ ok: true, count: items.length, rehosted });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
