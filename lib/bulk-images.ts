import sharp from 'sharp';
import { db } from './db';
import { log } from './log';
import { getGroups } from './groups-cache';
import { imageSpecs } from './image-specs';
import { channelColumns } from './channel-specs';
import { uploadToShopify } from './shopify-upload';

// Bulk images: resize every not-yet-sent listing image to the marketplace size and extend the
// background (nothing cropped). Previews wait for approval; only approved images are uploaded.

const clean = (s: string) => (s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- the image work ----------

function stats(px: Buffer, w: number, x0: number, y0: number, x1: number, y1: number) {
  const vals: number[][] = [[], [], []];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 3; vals[0].push(px[i]); vals[1].push(px[i + 1]); vals[2].push(px[i + 2]); }
  const med = vals.map((a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1] ?? 255; });
  const sd = vals.map((a) => { const m = a.reduce((p, q) => p + q, 0) / (a.length || 1); return Math.sqrt(a.reduce((p, q) => p + (q - m) * (q - m), 0) / (a.length || 1)); });
  return { med, sd: Math.max(...sd) };
}

export async function extendTo(input: Buffer, W: number, H: number): Promise<{ out: Buffer; flag: string | null }> {
  const upright = await sharp(input).rotate().flatten({ background: '#ffffff' }).toBuffer();
  const img = sharp(upright);
  const m = await img.metadata();
  const iw = m.width ?? W, ih = m.height ?? H;
  const s = Math.min(W / iw, H / ih);
  const rw = Math.max(1, Math.round(iw * s)), rh = Math.max(1, Math.round(ih * s));
  const resized = await img.resize(rw, rh, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  // Look at the photo's own edges. A busy edge (model or product touching it) stays the frame edge:
  // all the new background goes on the quiet side instead.
  const k = Math.max(3, Math.round(Math.max(rw, rh) * 0.02));
  const S = { l: stats(resized, rw, 0, 0, k, rh), r: stats(resized, rw, rw - k, 0, rw, rh), t: stats(resized, rw, 0, 0, rw, k), b: stats(resized, rw, 0, rh - k, rw, rh) };
  const BUSY = 22;
  const split = (pad: number, a: { sd: number }, b: { sd: number }): [number, number] => {
    if (pad <= 0) return [0, 0];
    if (a.sd > BUSY && b.sd <= BUSY) return [0, pad];
    if (b.sd > BUSY && a.sd <= BUSY) return [pad, 0];
    return [Math.floor(pad / 2), pad - Math.floor(pad / 2)];
  };
  const [left, right] = split(W - rw, S.l, S.r);
  const [top, bottom] = split(H - rh, S.t, S.b);
  const strips = [left > 0 ? S.l : null, right > 0 ? S.r : null, top > 0 ? S.t : null, bottom > 0 ? S.b : null].filter(Boolean) as { med: number[]; sd: number }[];
  const raw = { raw: { width: rw, height: rh, channels: 3 as const } };
  if (!strips.length) return { out: await sharp(resized, raw).jpeg({ quality: 92, mozjpeg: true }).toBuffer(), flag: null };

  const busy = Math.max(...strips.map((x) => x.sd));
  const flag = busy > BUSY ? 'Model or product touches the photo edge — check this one' : null;
  let base: Buffer;
  if (busy < 6) {
    // Plain studio background: a clean solid fill in the photo's own colour.
    const c = [0, 1, 2].map((i) => Math.round(strips.reduce((p, x) => p + x.med[i], 0) / strips.length));
    base = await sharp({ create: { width: W, height: H, channels: 3, background: { r: c[0], g: c[1], b: c[2] } } }).png().toBuffer();
  } else {
    // Textured / gradient background: continue the edge pixels outwards and soften them.
    const copied = await sharp(resized, raw).extend({ left, right, top, bottom, extendWith: 'copy' }).png().toBuffer();
    base = await sharp(copied).blur(Math.max(8, Math.round(Math.max(left, right, top, bottom) / 6))).png().toBuffer();
  }
  const photo = await sharp(resized, raw).png().toBuffer();
  const out = await sharp(base).composite([{ input: photo, left, top }]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  return { out, flag };
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 CatalogSync' } });
  if (!res.ok) throw new Error(`Could not download the image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- jobs ----------

const g = globalThis as unknown as { __bulkRunning?: Set<string>; __bulkApplying?: boolean };
g.__bulkRunning ??= new Set();

export async function startJob(channelKey: string, opts: { w: number; h: number; skipSaved: boolean; groupKeys?: string[] }) {
  const slots = channelColumns[channelKey]?.images.length ?? imageSpecs[channelKey]?.max ?? 8;
  const groups = (await getGroups(channelKey)).filter((x) => !opts.groupKeys?.length || opts.groupKeys.includes(x.key));
  const handled = new Set((await db.bulkImage.findMany({ where: { channelKey }, select: { groupKey: true }, distinct: ['groupKey'] })).map((r: { groupKey: string }) => r.groupKey));
  const saved = opts.skipSaved ? new Set((await db.imageSet.findMany({ where: { channelKey }, select: { styleCode: true, color: true } })).map((s: { styleCode: string; color: string }) => `${s.styleCode}|${s.color}`)) : new Set<string>();

  const todo = groups.filter((x) => x.images.length && (opts.groupKeys?.length || !handled.has(x.key)) && !saved.has(`${x.styleCode}|${x.color}`));
  if (!todo.length) throw new Error('Nothing new to do — every colour in this queue was already processed, edited by hand, or has no images');
  const job = await db.bulkJob.create({ data: { channelKey, width: opts.w, height: opts.h, status: 'running' } });
  const rows = todo.flatMap((x) => x.images.slice(0, slots).map((u, i) => ({ jobId: job.id, channelKey, groupKey: x.key, styleCode: x.styleCode, color: x.color, title: x.title, position: i, sourceUrl: u })));
  if (opts.groupKeys?.length) await db.bulkImage.deleteMany({ where: { channelKey, groupKey: { in: opts.groupKeys }, status: { in: ['ready', 'failed', 'rejected', 'queued'] } } });
  for (let i = 0; i < rows.length; i += 500) await db.bulkImage.createMany({ data: rows.slice(i, i + 500) });
  await db.bulkJob.update({ where: { id: job.id }, data: { total: rows.length } });
  await log('system', `Bulk images started for ${channelKey}: ${todo.length} colour(s), ${rows.length} image(s) at ${opts.w}×${opts.h}`);
  void runJob(job.id);
  return { jobId: job.id, colours: todo.length, images: rows.length };
}

export async function runJob(jobId: string) {
  if (g.__bulkRunning!.has(jobId)) return;
  g.__bulkRunning!.add(jobId);
  try {
    const job = await db.bulkJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    for (;;) {
      const batch = await db.bulkImage.findMany({ where: { jobId, status: 'queued' }, take: 3, orderBy: [{ groupKey: 'asc' }, { position: 'asc' }] });
      if (!batch.length) break;
      await Promise.all(batch.map(async (r: { id: string; sourceUrl: string }) => {
        try {
          const { out, flag } = await extendTo(await fetchImage(r.sourceUrl), job.width, job.height);
          const preview = await sharp(out).resize({ width: 500 }).jpeg({ quality: 78 }).toBuffer();
          await db.bulkImage.update({ where: { id: r.id }, data: { status: 'ready', data: new Uint8Array(preview), flag } });
          await db.bulkJob.update({ where: { id: jobId }, data: { done: { increment: 1 } } });
        } catch (e) {
          await db.bulkImage.update({ where: { id: r.id }, data: { status: 'failed', error: (e as Error).message.slice(0, 300) } });
          await db.bulkJob.update({ where: { id: jobId }, data: { failed: { increment: 1 } } });
        }
      }));
    }
    await db.bulkJob.update({ where: { id: jobId }, data: { status: 'done' } });
  } finally {
    g.__bulkRunning!.delete(jobId);
  }
}

// Pick up jobs that were cut off by a restart.
export async function resumeJobs() {
  for (const j of await db.bulkJob.findMany({ where: { status: 'running' }, select: { id: true } })) void runJob(j.id);
  void applyApproved();
}

// ---------- approval ----------

export async function setStatus(ids: string[], status: 'approved' | 'rejected' | 'ready') {
  await db.bulkImage.updateMany({ where: { id: { in: ids }, status: { in: ['ready', 'approved', 'rejected', 'failed'] } }, data: { status, error: null } });
  if (status === 'approved') void applyApproved();
}

export async function markManual(channelKey: string, groupKey: string) {
  await db.bulkImage.updateMany({ where: { channelKey, groupKey, status: { in: ['queued', 'ready', 'approved', 'failed'] } }, data: { status: 'manual', data: null } });
}

// Approved → full-size again from the original, upload to Shopify, then save the colour's image set.
export async function applyApproved() {
  if (g.__bulkApplying) return;
  g.__bulkApplying = true;
  try {
    for (;;) {
      const r = await db.bulkImage.findFirst({ where: { status: 'approved' }, orderBy: [{ updatedAt: 'asc' }] });
      if (!r) break;
      try {
        const job = await db.bulkJob.findUnique({ where: { id: r.jobId } });
        const { out } = await extendTo(await fetchImage(r.sourceUrl), job?.width ?? 1600, job?.height ?? 1600);
        const url = await uploadToShopify(out, `${clean(r.styleCode)}_${clean(r.color)}_${r.channelKey}_${r.position + 1}`, 'jpeg');
        await db.bulkImage.update({ where: { id: r.id }, data: { status: 'applied', resultUrl: url, data: null } });

        // The colour's image set: approved ones replaced, everything else as it was.
        const all = await db.bulkImage.findMany({ where: { channelKey: r.channelKey, groupKey: r.groupKey, jobId: r.jobId }, orderBy: { position: 'asc' } });
        const current = (await db.imageSet.findUnique({ where: { channelKey_styleCode_color: { channelKey: r.channelKey, styleCode: r.styleCode, color: r.color } } }))?.images as string[] | undefined;
        const images = all.map((x: { position: number; status: string; resultUrl: string | null; sourceUrl: string }) => (x.status === 'applied' && x.resultUrl ? x.resultUrl : current?.[x.position] ?? x.sourceUrl));
        await db.imageSet.upsert({
          where: { channelKey_styleCode_color: { channelKey: r.channelKey, styleCode: r.styleCode, color: r.color } },
          update: { images }, create: { channelKey: r.channelKey, styleCode: r.styleCode, color: r.color, images },
        });
      } catch (e) {
        await db.bulkImage.update({ where: { id: r.id }, data: { status: 'failed', error: `Upload: ${(e as Error).message}`.slice(0, 300) } });
      }
    }
  } finally {
    g.__bulkApplying = false;
  }
}

export async function overview(channelKey: string, status: string) {
  const jobs = await db.bulkJob.findMany({ where: { channelKey }, orderBy: { createdAt: 'desc' }, take: 5 });
  if (jobs.some((j: { status: string; id: string }) => j.status === 'running' && !g.__bulkRunning!.has(j.id))) void resumeJobs();
  const counts = Object.fromEntries((await db.bulkImage.groupBy({ by: ['status'], where: { channelKey }, _count: { _all: true } })).map((c: { status: string; _count: { _all: number } }) => [c.status, c._count._all]));
  const want = status === 'review' ? ['ready', 'failed', 'queued'] : status === 'approved' ? ['approved', 'applied'] : status === 'rejected' ? ['rejected', 'manual'] : ['ready', 'failed', 'queued', 'approved', 'applied', 'rejected', 'manual'];
  const rows = await db.bulkImage.findMany({ where: { channelKey, status: { in: want } }, select: { id: true, groupKey: true, styleCode: true, color: true, title: true, position: true, sourceUrl: true, status: true, flag: true, error: true, resultUrl: true }, orderBy: [{ groupKey: 'asc' }, { position: 'asc' }], take: 3000 });
  const groups = new Map<string, { groupKey: string; styleCode: string; color: string; title: string; items: typeof rows }>();
  for (const r of rows) { if (!groups.has(r.groupKey)) groups.set(r.groupKey, { groupKey: r.groupKey, styleCode: r.styleCode, color: r.color, title: r.title, items: [] }); groups.get(r.groupKey)!.items.push(r); }
  return { jobs, counts, groups: [...groups.values()] };
}
