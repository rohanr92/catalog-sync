import sharp from 'sharp';
import { db } from './db';
import { uploadToShopify } from './shopify-upload';

const clean = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hex = (rgb: number[]) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// Standard shades for common colour names, used when there's no photo to sample.
const NAMED: Record<string, string> = {
  nude: '#e3bc9a', black: '#141414', white: '#f5f5f2', ivory: '#f6f1e1', cream: '#f1e4c8', beige: '#d9c3a0', sand: '#d8c3a0', taupe: '#8b7d6b',
  tan: '#c08a5a', camel: '#c19a6b', cognac: '#9a4e1c', brown: '#6b4226', chocolate: '#4e2a1a', 'dark chocolate': '#3b2016', chestnut: '#7b3f22',
  burgundy: '#6d1a2b', wine: '#722f37', red: '#b3202a', pink: '#e8a0b4', blush: '#e8b4b8', 'baby pink': '#f4c2cf', navy: '#1f2a44', blue: '#2f5da8',
  green: '#2f6b3f', olive: '#6b6b3a', grey: '#8c8c8c', gray: '#8c8c8c', charcoal: '#3f4144', silver: '#c0c0c0', gold: '#c9a227', mustard: '#d4a017',
  orange: '#e07b39', yellow: '#e8c547', purple: '#6b4e9a', maroon: '#6a1b2a', stone: '#b8ad9c', latte: '#b99a7c', mocha: '#7b5b45', khaki: '#bdb76b',
};
export function namedColour(color: string): string | null {
  const c = (color || '').toLowerCase().trim();
  if (NAMED[c]) return NAMED[c];
  const hit = Object.keys(NAMED).sort((a, b) => b.length - a.length).find((k) => c.includes(k));
  return hit ? NAMED[hit] : null;
}

// Find the smoothest patch of the product's main colour (the leather/suede surface), away from the background.
export async function leatherPatch(input: Buffer): Promise<{ buf: Buffer; rgb: number[] }> {
  const meta = await sharp(input).metadata();
  const W = meta.width ?? 1000, H = meta.height ?? 1000;
  const scale = 160 / Math.max(W, H);
  const sw = Math.max(8, Math.round(W * scale)), sh = Math.max(8, Math.round(H * scale));
  const data = await sharp(input).resize(sw, sh, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const px = (x: number, y: number) => { const i = (y * sw + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  const isBg = (p: number[]) => (p[0] > 232 && p[1] > 232 && p[2] > 232) || (Math.max(...p) - Math.min(...p) < 10 && p[0] > 212);

  const fg: number[][] = [];
  for (let y = 0; y < sh; y += 2) for (let x = 0; x < sw; x += 2) { const p = px(x, y); if (!isBg(p)) fg.push(p); }
  const med = (k: number) => { const v = fg.map((p) => p[k]).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 128; };
  const dom = [med(0), med(1), med(2)];

  const side = Math.max(6, Math.round(Math.min(sw, sh) * 0.2));
  const stepPx = Math.max(2, Math.round(side / 4));
  let best: { x: number; y: number; score: number; rgb: number[] } | null = null;
  for (let y = 0; y + side <= sh; y += stepPx) for (let x = 0; x + side <= sw; x += stepPx) {
    let bg = 0, n = 0, sr = 0, sg = 0, sb = 0, sq = 0;
    for (let yy = y; yy < y + side; yy += 2) for (let xx = x; xx < x + side; xx += 2) {
      const p = px(xx, yy); n++;
      if (isBg(p)) bg++;
      sr += p[0]; sg += p[1]; sb += p[2];
      const l = 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]; sq += l * l;
    }
    const m = [sr / n, sg / n, sb / n];
    const ml = 0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2];
    const sd = Math.sqrt(Math.max(0, sq / n - ml * ml));
    const dist = Math.hypot(m[0] - dom[0], m[1] - dom[1], m[2] - dom[2]);
    const score = (bg / n) * 1000 + sd + dist * 0.8;
    if (!best || score < best.score) best = { x, y, score, rgb: m };
  }
  const b = best ?? { x: Math.round((sw - side) / 2), y: Math.round((sh - side) / 2), score: 0, rgb: dom };
  const f = 1 / scale;
  const left = Math.max(0, Math.min(W - 2, Math.round(b.x * f))), top = Math.max(0, Math.min(H - 2, Math.round(b.y * f)));
  const size = Math.max(2, Math.min(Math.round(side * f), W - left, H - top));
  const buf = await sharp(input).extract({ left, top, width: size, height: size }).resize(1000, 1000, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
  return { buf, rgb: b.rgb };
}

async function fetchImage(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the primary image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

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
  const { buf } = await leatherPatch(await fetchImage(primaryUrl));
  return uploadToShopify(buf, `Swatch_${clean(styleCode)}_${clean(color)}.jpg`, 'jpeg');
}

// Colour suggestion for a solid swatch: sampled from the leather patch, else the standard shade for the name.
export async function suggestSwatchColour(color: string, primaryUrl?: string): Promise<{ hex: string; from: 'image' | 'name' | 'default' }> {
  if (primaryUrl) { try { return { hex: hex((await leatherPatch(await fetchImage(primaryUrl))).rgb), from: 'image' }; } catch { /* fall back */ } }
  const n = namedColour(color);
  return n ? { hex: n, from: 'name' } : { hex: '#cccccc', from: 'default' };
}

export async function solidSwatch(hexColour: string, styleCode: string, color: string): Promise<string> {
  if (!/^#[0-9a-fA-F]{6}$/.test(hexColour)) throw new Error('Colour must look like #e3bc9a');
  const buf = await sharp({ create: { width: 1000, height: 1000, channels: 3, background: hexColour } }).jpeg({ quality: 95 }).toBuffer();
  return uploadToShopify(buf, `Swatch_${clean(styleCode)}_${clean(color)}_solid.jpg`, 'jpeg');
}

export async function setSwatch(styleCode: string, color: string, url: string, source: string) {
  return db.swatch.upsert({ where: { styleCode_color: { styleCode, color } }, update: { url, source }, create: { styleCode, color, url, source } });
}

export async function ensureSwatch(styleCode: string, color: string, primaryUrl: string | undefined): Promise<{ url: string; source: string } | null> {
  const reused = await findReusableSwatch(styleCode, color);
  if (reused) { await setSwatch(styleCode, color, reused, 'reused'); return { url: reused, source: 'reused' }; }
  if (!primaryUrl) return null;
  const url = await autoSwatchFromImage(primaryUrl, styleCode, color);
  await setSwatch(styleCode, color, url, 'auto');
  return { url, source: 'auto' };
}
