import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const { items, format, zipName } = await req.json() as { items: { url: string; name: string }[]; format: 'jpeg' | 'png'; zipName?: string };
  const zip = new JSZip();
  const ext = format === 'png' ? 'png' : 'jpg';
  let added = 0;
  for (const it of items ?? []) {
    try {
      const r = await fetch(it.url);
      if (!r.ok) continue;
      const img = sharp(Buffer.from(await r.arrayBuffer()));
      const out = format === 'png' ? await img.png().toBuffer() : await img.flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
      zip.file(`${it.name}.${ext}`, out);
      added++;
    } catch { /* skip that one */ }
  }
  if (!added) return NextResponse.json({ error: 'None of the images could be downloaded' }, { status: 400 });
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return new NextResponse(new Uint8Array(buf), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${zipName ?? 'images'}.zip"` } });
}
