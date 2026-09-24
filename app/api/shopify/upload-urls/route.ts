import { NextResponse } from 'next/server';
import { uploadToShopify } from '@/lib/shopify-upload';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Re-host images that are already online (e.g. Nordstrom links) on Shopify, in order.
export async function POST(req: Request) {
  const { items, format } = await req.json() as { items: { url: string; name: string }[]; format: 'jpeg' | 'png' };
  const results: { url?: string; error?: string }[] = [];
  for (const it of items ?? []) {
    try {
      const r = await fetch(it.url);
      if (!r.ok) throw new Error(`download failed (${r.status})`);
      results.push({ url: await uploadToShopify(Buffer.from(await r.arrayBuffer()), it.name, format === 'png' ? 'png' : 'jpeg') });
    } catch (e) { results.push({ error: (e as Error).message }); }
  }
  return NextResponse.json({ results });
}
