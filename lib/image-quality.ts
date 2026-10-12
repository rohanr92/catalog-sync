import crypto from 'node:crypto';
import sharp from 'sharp';
import { db } from './db';
import { computeHealth, channelName } from './health';
import { imageSpecs } from './image-specs';

// Image quality: every image on every marketplace (and Nordstrom) is opened once and checked for
// size, shape, white background, product filling the frame, blur, duplicates and broken links.
// Results are kept per image URL — a new or replaced image is checked automatically.

export interface ImgCheck { w: number; h: number; kb: number; bg: 'white' | 'light' | 'other' | ''; fill: number; sharp: number; hash: string; err?: string; at: string }
export interface ImgIssue { level: 'bad' | 'warn'; text: string }
export interface ImgRowImage { url: string; check: ImgCheck | null; issues: ImgIssue[] }
export interface ImgRow { channel: string; name: string; key: string; styleCode: string; color: string; title: string; nordStyle: string | null; nordColor: string | null; images: ImgRowImage[]; bad: number; warn: number; pending: number }

const shardOf = (url: string) => `imgq:${crypto.createHash('md5').update(url).digest('hex')[0]}`;
let cache: Map<string, ImgCheck> | null = null;

async function loadChecks(): Promise<Map<string, ImgCheck>> {
  if (cache) return cache;
  const rows = (await db.setting.findMany({ where: { key: { startsWith: 'imgq:' } } })) as { key: string; value: unknown }[];
  const m = new Map<string, ImgCheck>();
  for (const r of rows) for (const [u, c] of Object.entries((r.value ?? {}) as Record<string, ImgCheck>)) m.set(u, c);
  cache = m;
  return m;
}

async function saveChecks(fresh: Map<string, ImgCheck | null>) {
  const all = await loadChecks();
  const touched = new Set<string>();
  for (const [u, c] of fresh) { if (c) all.set(u, c); else all.delete(u); touched.add(shardOf(u)); }
  for (const key of touched) {
    const value: Record<string, ImgCheck> = {};
    for (const [u, c] of all) if (shardOf(u) === key) value[u] = c;
    await db.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
  }
}

// ---------- looking at one image ----------
export async function analyse(url: string): Promise<ImgCheck> {
  const at = new Date().toISOString();
  const empty: ImgCheck = { w: 0, h: 0, kb: 0, bg: '', fill: 0, sharp: 0, hash: '', at };
  let buf: Buffer;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return { ...empty, err: `Broken link (${res.status})` };
    buf = Buffer.from(await res.arrayBuffer());
  } catch { return { ...empty, err: 'Broken link (no answer)' }; }
  try {
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    let w = meta.width ?? 0, h = meta.height ?? 0;
    if ((meta.orientation ?? 1) >= 5) [w, h] = [h, w];

    // background + how much of the frame the product fills
    const N = 256;
    const px = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    let ring = 0, whiteRing = 0, sum = 0, sum2 = 0;
    let x1 = N, y1 = N, x2 = -1, y2 = -1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2];
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b), lum = (r + g + b) / 3;
      if (x < 4 || y < 4 || x >= N - 4 || y >= N - 4) { ring++; sum += lum; sum2 += lum * lum; if (mn >= 240) whiteRing++; }
      if (mn < 232 || mx - mn > 14) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    }
    const mean = sum / ring, sd = Math.sqrt(Math.max(0, sum2 / ring - mean * mean));
    const bg: ImgCheck['bg'] = whiteRing / ring >= 0.92 ? 'white' : mean >= 200 && sd < 8 ? 'light' : 'other';
    const fill = x2 < 0 ? 0 : Math.max((x2 - x1 + 1) / N, (y2 - y1 + 1) / N);

    // sharpness: how strong the edges are on the product (not on the plain background)
    const { data: gr, info } = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize(512, 512, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    let n = 0, s1 = 0, s2 = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = gr[y * W + x];
      if (c >= 235) continue;
      const lap = 4 * c - gr[(y - 1) * W + x] - gr[(y + 1) * W + x] - gr[y * W + x - 1] - gr[y * W + x + 1];
      n++; s1 += lap; s2 += lap * lap;
    }
    const sharpness = n > 2000 ? Math.round(s2 / n - (s1 / n) ** 2) : 0;

    // fingerprint to spot the same picture twice
    const d = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
    let hash = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x += 4) {
      let v = 0;
      for (let k = 0; k < 4; k++) v = v * 2 + (d[y * 9 + x + k] > d[y * 9 + x + k + 1] ? 1 : 0);
      hash += v.toString(16);
    }

    return { w, h, kb: Math.round(buf.length / 1024), bg, fill: Math.round(fill * 100) / 100, sharp: sharpness, hash, at };
  } catch { return { ...empty, kb: Math.round(buf.length / 1024), err: 'Not a readable image' }; }
}

const hamming = (a: string, b: string) => { let n = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i] ?? '0', 16); while (x) { n += x & 1; x >>= 1; } } return n; };

// ---------- what is wrong with a set of images on one marketplace ----------
export function issuesFor(channel: string, urls: string[], checks: Map<string, ImgCheck>): ImgIssue[][] {
  const spec = imageSpecs[channel];
  const allowed = spec ? [{ w: spec.w, h: spec.h }, ...(spec.alt ?? [])] : [];
  return urls.map((u, i) => {
    const c = checks.get(u);
    if (!c) return [];
    if (c.err) return [{ level: 'bad', text: c.err }];
    const out: ImgIssue[] = [];
    if (allowed.length) {
      const big = allowed.some((a) => c.w >= a.w * 0.98 && c.h >= a.h * 0.98);
      const shape = allowed.some((a) => Math.abs(c.w / c.h - a.w / a.h) / (a.w / a.h) < 0.02);
      if (!big) out.push({ level: 'bad', text: `Too small ${c.w}×${c.h} — needs ${spec!.w}×${spec!.h}` });
      else if (!shape) out.push({ level: 'warn', text: `Wrong shape ${c.w}×${c.h} — needs ${spec!.ratio}` });
    } else if (Math.min(c.w, c.h) < 1000) out.push({ level: 'warn', text: `Low resolution ${c.w}×${c.h}` });
    if (i === 0 && c.bg === 'other') out.push({ level: 'bad', text: 'Main image background not white' });
    if (c.bg !== 'other' && c.fill > 0 && c.fill < 0.6) out.push({ level: 'warn', text: `Product small in frame (${Math.round(c.fill * 100)}%)` });
    if (c.sharp > 0 && c.sharp < 20) out.push({ level: 'warn', text: 'May be blurry' });
    for (let j = 0; j < i; j++) { const o = checks.get(urls[j]); if (o?.hash && c.hash && o.h && Math.abs(o.w / o.h - c.w / c.h) < 0.02 && hamming(o.hash, c.hash) <= 3) { out.push({ level: 'warn', text: `Same picture as image ${j + 1}` }); break; } }
    return out;
  });
}

// ---------- the page ----------
export async function buildImageQuality() {
  const [{ items, channels }, checks] = await Promise.all([computeHealth(), loadChecks()]);
  const rows: ImgRow[] = [];
  for (const it of items) {
    const urls = [...new Set(it.images.filter(Boolean))];
    if (!urls.length) continue;
    const iss = issuesFor(it.channel, urls, checks);
    const images = urls.map((url, i) => ({ url, check: checks.get(url) ?? null, issues: iss[i] }));
    rows.push({
      channel: it.channel, name: channelName(it.channel), key: it.key, styleCode: it.styleCode, color: it.color, title: it.title, nordStyle: it.nordStyle, nordColor: it.nordColor, images,
      bad: images.filter((x) => x.issues.some((y) => y.level === 'bad')).length,
      warn: images.filter((x) => x.issues.length && !x.issues.some((y) => y.level === 'bad')).length,
      pending: images.filter((x) => !x.check).length,
    });
  }
  rows.sort((a, b) => b.bad - a.bad || b.warn - a.warn || a.title.localeCompare(b.title));
  const summary = channels.map((c) => {
    const rs = rows.filter((r) => r.channel === c);
    const imgs = rs.flatMap((r) => r.images);
    return { key: c, name: channelName(c), styles: rs.length, images: imgs.length, checked: imgs.filter((x) => x.check).length, bad: rs.filter((r) => r.bad).length, warn: rs.filter((r) => !r.bad && r.warn).length };
  });
  return { rows, summary };
}

// ---------- background checking ----------
let running = false;
export async function scanSome(limit = 40, budgetMs = 45_000) {
  if (running) return { checked: 0, left: -1 };
  running = true;
  try {
    const [{ items }, checks] = await Promise.all([computeHealth(), loadChecks()]);
    const dayAgo = Date.now() - 86_400_000;
    const todo: string[] = [];
    const seen = new Set<string>();
    // main images first, then the rest; broken ones are tried again after a day
    for (const pass of [0, 1]) for (const it of items) it.images.forEach((u, i) => {
      if (!u || seen.has(u) || (pass === 0 ? i !== 0 : i === 0)) return;
      seen.add(u);
      const c = checks.get(u);
      if (!c || (c.err && new Date(c.at).getTime() < dayAgo)) todo.push(u);
    });
    const started = Date.now();
    const fresh = new Map<string, ImgCheck | null>();
    let idx = 0;
    const worker = async () => {
      while (idx < Math.min(limit, todo.length) && Date.now() - started < budgetMs) {
        const u = todo[idx++];
        fresh.set(u, await analyse(u));
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (fresh.size) await saveChecks(fresh);
    return { checked: fresh.size, left: Math.max(0, todo.length - fresh.size) };
  } finally {
    running = false;
  }
}

export async function recheck(url: string) {
  const c = await analyse(url);
  await saveChecks(new Map([[url, c]]));
  return c;
}

export async function imageQualityTick() { await scanSome(40, 45_000); }
