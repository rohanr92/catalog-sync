import { NextResponse } from 'next/server';
import { ensureSwatch, setSwatch, autoSwatchFromImage } from '@/lib/swatch';
import { uploadToShopify } from '@/lib/shopify-upload';
import { getGroups as buildGroups } from "@/lib/groups-cache";
import { channelColumns } from '@/lib/channel-specs';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const ct = req.headers.get('content-type') ?? '';
  try {
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const style = String(form.get('style') ?? ''), color = String(form.get('color') ?? '');
      const file = form.get('file') as File | null;
      if (!style || !file) return NextResponse.json({ error: 'style and file required' }, { status: 400 });
      const url = await uploadToShopify(Buffer.from(await file.arrayBuffer()), `Swatch_${style}_${color}`, 'jpeg');
      await setSwatch(style, color, url, 'manual');
      return NextResponse.json({ url, source: 'manual' });
    }

    const body = await req.json();

    if (body.bulk && body.channel) {
      const spec = channelColumns[body.channel];
      if (!spec?.swatch) return NextResponse.json({ done: 0, note: 'This marketplace has no swatch column' });
      const groups = await buildGroups(body.channel);
      let done = 0, failed = 0;
      for (const g of groups) {
        if (g.validation === 'blocked' || g.swatchUrl) continue;
        try { const r = await ensureSwatch(g.styleCode, g.color, g.images[0]); if (r) done++; else failed++; } catch { failed++; }
      }
      return NextResponse.json({ done, failed });
    }

    const { style, color, mode, url, primaryUrl } = body;
    if (!style) return NextResponse.json({ error: 'style required' }, { status: 400 });
    if (mode === 'link' && url) { await setSwatch(style, color, url, 'manual'); return NextResponse.json({ url, source: 'manual' }); }
    if (mode === 'auto' && primaryUrl) { const u = await autoSwatchFromImage(primaryUrl, style, color); await setSwatch(style, color, u, 'auto'); return NextResponse.json({ url: u, source: 'auto' }); }
    const r = await ensureSwatch(style, color, primaryUrl);
    if (!r) return NextResponse.json({ error: 'No existing swatch found and no primary image to crop from' }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
