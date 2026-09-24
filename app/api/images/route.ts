import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelColumns } from '@/lib/channel-specs';
import { short } from '@/lib/errors';

type Row = Record<string, string>;

export async function POST(req: Request) {
  try {
    const { channel, style, color, images, alsoChannels } = await req.json();
    if (!channel || !style || color == null || !Array.isArray(images)) return NextResponse.json({ error: 'channel, style, color, images required' }, { status: 400 });
    const targets: string[] = [channel, ...((alsoChannels as string[]) ?? [])];

    for (const channelKey of targets) {
      await db.imageSet.upsert({
        where: { channelKey_styleCode_color: { channelKey, styleCode: style, color } },
        update: { images },
        create: { channelKey, styleCode: style, color, images },
      });
    }

    // Every size of this colour that is already live on the marketplace gets the same image set, via Image changes.
    const products = await db.product.findMany({ where: { color }, select: { gtin: true, sku: true, title: true, categoryRaw: true, attrs: true } });
    const colour = products.filter((p) => ((p.attrs as Row)['variant-group-code'] || (p.attrs as Row)['vpn'] || p.sku || p.gtin) === style);
    const gtins = colour.map((p) => p.gtin);
    let liveSizesQueued = 0;

    for (const channelKey of targets) {
      const slots = channelColumns[channelKey]?.images.length ?? 8;
      const want = (images as string[]).slice(0, slots);
      const live = await db.channelProduct.findMany({ where: { channelKey, upc: { in: gtins } }, select: { upc: true, images: true } });
      const differ = live.filter((l) => JSON.stringify(((l.images as string[]) ?? []).slice(0, slots)) !== JSON.stringify(want));
      if (!differ.length) continue;

      const old = (differ[0].images as string[]) ?? [];
      const positions: number[] = [];
      for (let i = 0; i < Math.max(old.length, want.length); i++) if (old[i] !== want[i]) positions.push(i + 1);
      const data = {
        title: colour[0]?.title ?? '', category: colour[0]?.categoryRaw ?? '', gtins: differ.map((d) => d.upc),
        positions, oldImages: old, newImages: want, images: want, source: 'manual', detectedAt: new Date(),
      };
      const open = await db.imageChange.findFirst({ where: { channelKey, styleCode: style, color, status: 'pending' } });
      if (open) await db.imageChange.update({ where: { id: open.id }, data });
      else await db.imageChange.create({ data: { channelKey, styleCode: style, color, ...data } });
      liveSizesQueued += differ.length;
    }

    await log("approval", "Images saved for " + style + " " + color + " on " + targets.join(", "));
    return NextResponse.json({ ok: true, channels: targets, liveSizesQueued });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
