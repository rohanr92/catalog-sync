import sharp from 'sharp';
import { db } from './db';
import { uploadToShopify } from './shopify-upload';

const clean = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function findReusableSwatch(styleCode: string, color: string): Promise<string | null> {
  const own = await db.swatch.findUnique({ where: { styleCode_color: { styleCode, color } } });
  if (own) return own.url;
  const products = await db.product.findMany({ where: { color }, select: { gtin: true, attrs: true, sku: true } });
  const gtins = products.filter((p) => ((p.attrs as Record<string, string>)['variant-group-code'] || (p.attrs as Record<string, string>)['vpn'] || p.sku) === styleCode).map((p) => p.gtin);
  if (!gtins.length) return null;
  const row = await db.channelProduct.findFirst({ where: { upc: { in: gtins }, swatchUrl: { not: null } }, select: { swatchUrl: true } });
  return row?.swatchUrl ?? null;
}

export async function autoSwatchFromImage(primaryUrl: string, styleCode: string, color: string): Promise<string> {
  const res = await fetch(primaryUrl);
  if (!res.ok) throw new Error(`Could not fetch primary image (${res.status})`);
  const input = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 1000, h = meta.height ?? 1000;
  const side = Math.round(Math.min(w, h) * 0.35);
  const left = Math.round((w - side) / 2), top = Math.round((h - side) / 2);
  const out = await sharp(input).extract({ left, top, width: side, height: side }).resize(1000, 1000, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
  return uploadToShopify(out, `Swatch_${clean(styleCode)}_${clean(color)}.jpg`, 'jpeg');
}

export async function setSwatch(styleCode: string, color: string, url: string, source: 'auto' | 'reused' | 'manual') {
  return db.swatch.upsert({
    where: { styleCode_color: { styleCode, color } },
    update: { url, source },
    create: { styleCode, color, url, source },
  });
}

export async function ensureSwatch(styleCode: string, color: string, primaryUrl: string | undefined): Promise<{ url: string; source: string } | null> {
  const reused = await findReusableSwatch(styleCode, color);
  if (reused) { await setSwatch(styleCode, color, reused, 'reused'); return { url: reused, source: 'reused' }; }
  if (!primaryUrl) return null;
  const url = await autoSwatchFromImage(primaryUrl, styleCode, color);
  await setSwatch(styleCode, color, url, 'auto');
  return { url, source: 'auto' };
}
