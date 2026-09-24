import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelColumns } from '@/lib/channel-specs';
import { groupKeyOf } from '@/lib/channel-catalog';
import { log } from '@/lib/log';
import { short } from '@/lib/errors';

type Row = Record<string, string>;

export async function POST(req: Request) {
  try {
    const { channel, style, color, images, alsoChannels } = await req.json();
    if (!channel || !style || color == null || !Array.isArray(images)) return NextResponse.json({ error: 'channel, style, color, images required' }, { status: 400 });
    const targets: string[] = [channel, ...((alsoChannels as string[]) ?? [])];

    // Images for the sizes being listed from the queue.
    for (const channelKey of targets) {
      await db.imageSet.upsert({
        where: { channelKey_styleCode_color: { channelKey, styleCode: style, color } },
        update: { images },
        create: { channelKey, styleCode: style, color, images },
      });
    }

    // Sizes of this colour already live on the marketplace: prepare a draft under
    // Marketplace products → Edit products, so the whole colour can match.
    // (Image changes stays for Nordstrom-driven changes only.)
    const products = await db.product.findMany({ where: { color }, select: { gtin: true, sku: true, title: true, attrs: true } });
    const gtins = products.filter((p) => ((p.attrs as Row)['variant-group-code'] || (p.attrs as Row)['vpn'] || p.sku || p.gtin) === style).map((p) => p.gtin);
    let liveSizesQueued = 0;

    for (const channelKey of targets) {
      const slots = channelColumns[channelKey]?.images.length ?? 8;
      const want = (images as string[]).slice(0, slots);
      const live = await db.channelProduct.findMany({ where: { channelKey, upc: { in: gtins } }, select: { upc: true, images: true, styleCode: true, title: true, color: true } });
      const differ = live.filter((l) => JSON.stringify(((l.images as string[]) ?? []).slice(0, slots)) !== JSON.stringify(want));
      if (!differ.length) continue;

      const groupKey = groupKeyOf(differ[0]);
      const open = await db.channelEdit.findFirst({ where: { channelKey, groupKey, status: { in: ['draft', 'approved', 'rejected'] } } });
      const upcs = [...new Set([...((open?.upcs as string[]) ?? []), ...differ.map((d) => d.upc)])];
      const data = { title: differ[0].title ?? '', color: differ[0].color ?? color, upcs, images: want, status: 'draft', sendError: null };
      if (open) await db.channelEdit.update({ where: { id: open.id }, data });
      else await db.channelEdit.create({ data: { channelKey, groupKey, fields: {}, ...data } });
      liveSizesQueued += differ.length;
    }

    await log('approval', 'Images saved for ' + style + ' ' + color + ' on ' + targets.join(', ') + (liveSizesQueued ? ' — ' + liveSizesQueued + ' live size(s) drafted under Marketplace products' : ''));
    return NextResponse.json({ ok: true, channels: targets, liveSizesQueued });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
