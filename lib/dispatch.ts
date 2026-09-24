import { sendNordstrom } from "./nordstrom-send";
import { log } from "./log";
import * as XLSX from 'xlsx';
import { db } from './db';
import { channelColumns, OFFER_COLUMNS } from './channel-specs';
import { getColumnSpecs } from './static-data';
import { finalImages } from './image-changes';
import { uploadProducts, importStatus, importReport, RateLimited } from './mirakl';

type Row = Record<string, string>;
type Ref = { kind: 'listing' | 'image'; id: string; upc: string };
export const SEND_GAP_MS = 15 * 60_000;
const norm = (u: string) => String(u ?? '').trim().replace(/^0+/, '');

export async function readyToSend(channelKey: string) {
  if (channelKey === "nordstrom") { const n = await db.nordstromEdit.findMany({ where: { status: "approved" }, select: { gtins: true } }); return { sizes: n.reduce((s, e) => s + (e.gtins as string[]).length, 0), images: 0 }; }
  const ch = await db.channel.findUnique({ where: { key: channelKey } });
  if (!ch) return { sizes: 0, images: 0 };
  const [sizes, images] = await Promise.all([
    db.pendingChange.count({ where: { channelId: ch.id, approval: 'approved', submissionId: null } }),
    db.imageChange.count({ where: { channelKey, status: 'approved', submissionId: null } }),
  ]);
  return { sizes, images };
}

export async function nextAllowedAt(channelKey: string): Promise<Date | null> {
  const last = await db.submission.findFirst({ where: { channelKey, importId: { not: null } }, orderBy: { sentAt: 'desc' }, select: { sentAt: true } });
  if (!last) return null;
  const next = new Date(last.sentAt.getTime() + SEND_GAP_MS);
  return next.getTime() > Date.now() ? next : null;
}

export async function sendChannel(channelKey: string, source: 'manual' | 'auto') {
  if (channelKey === "nordstrom") return sendNordstrom(source);
  const ch = await db.channel.findUnique({ where: { key: channelKey } });
  const spec = channelColumns[channelKey];
  if (!ch || !spec) throw new Error('Unknown marketplace');
  const wait = await nextAllowedAt(channelKey);
  if (wait) throw new Error(`${ch.name} accepts one product file every 15 minutes. Next send from ${wait.toLocaleTimeString()}.`);

  const picked: { row: Row; category: string; ref: Ref }[] = [];
  let skipped = 0;
  const listings = await db.pendingChange.findMany({ where: { channelId: ch.id, approval: 'approved', submissionId: null }, select: { id: true, outputRow: true, product: { select: { gtin: true } } } });
  for (const l of listings) {
    const row = l.outputRow as Row;
    if (!row || !row[spec.category]) { skipped++; continue; }
    picked.push({ row, category: row[spec.category], ref: { kind: 'listing', id: l.id, upc: l.product.gtin } });
  }
  const imgs = await db.imageChange.findMany({ where: { channelKey, status: 'approved', submissionId: null } });
  for (const it of imgs) {
    const set = finalImages(it, spec.images.length);
    const cps = await db.channelProduct.findMany({ where: { channelKey, upc: { in: it.gtins as string[] } }, select: { upc: true, raw: true, category: true } });
    for (const cp of cps) {
      const row = { ...(cp.raw as Row) };
      spec.images.forEach((col, i) => { row[col] = set[i] ?? ''; });
      picked.push({ row, category: cp.category ?? '', ref: { kind: 'image', id: it.id, upc: cp.upc } });
    }
  }
  if (!picked.length) return { submissions: 0, rows: 0, skipped, errors: [] as string[] };

  const tpls = (await db.setting.findMany({ where: { key: { startsWith: `template:${channelKey}:` } } })).map((t) => t.value as { codes: string[]; categories: string[] });
  const label = new Map((await getColumnSpecs(channelKey)).map((s) => [s.code, s.label]));
  const byTpl = new Map<number, typeof picked>();
  for (const p of picked) { let idx = tpls.findIndex((t) => t.categories.includes(p.category)); if (idx < 0) idx = 0; if (!byTpl.has(idx)) byTpl.set(idx, []); byTpl.get(idx)!.push(p); }

  let sent = 0, subs = 0;
  const errors: string[] = [];
  for (const [idx, items] of byTpl) {
    const codes = (tpls[idx]?.codes ?? Object.keys(items[0].row)).filter((c) => c && !OFFER_COLUMNS.has(c));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([codes.map((c) => label.get(c) ?? c), codes, ...items.map((i) => codes.map((c) => i.row[c] ?? ''))]), 'Data');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const kinds = new Set(items.map((i) => i.ref.kind));
    const kind = kinds.size > 1 ? 'mixed' : [...kinds][0];
    const fileName = `${channelKey}-${kind}-${items.length}-rows-${Date.now()}.xlsx`;
    try {
      const importId = await uploadProducts(channelKey, buf, fileName);
      const sub = await db.submission.create({ data: { channelId: ch.id, channelKey, importId, rowCount: items.length, status: 'processing', kind, source, fileUrl: fileName } });
      const listingIds = [...new Set(items.filter((i) => i.ref.kind === 'listing').map((i) => i.ref.id))];
      const imageIds = [...new Set(items.filter((i) => i.ref.kind === 'image').map((i) => i.ref.id))];
      if (listingIds.length) await db.pendingChange.updateMany({ where: { id: { in: listingIds } }, data: { submissionId: sub.id, sendStatus: 'sent', sendError: null } });
      if (imageIds.length) await db.imageChange.updateMany({ where: { id: { in: imageIds } }, data: { submissionId: sub.id, sendStatus: 'sent', sendError: null } });
      sent += items.length; subs++;
    } catch (e) {
      const msg = (e as Error).message;
      await db.submission.create({ data: { channelId: ch.id, channelKey, rowCount: items.length, status: 'failed', kind, source, statusDetail: msg, completedAt: new Date() } });
      errors.push(msg);
      if (e instanceof RateLimited) break;
    }
  }
  if (sent || errors.length) await log("push", (source === "auto" ? "Auto-push" : "Manual send") + " to " + channelKey + ": " + sent + " rows in " + subs + " file(s)" + (skipped ? ", " + skipped + " skipped" : "") + (errors.length ? " — " + errors[0] : ""), errors.length ? "warn" : "info");
  return { submissions: subs, rows: sent, skipped, errors };
}

// Reads a Mirakl error report (csv or xlsx) and returns UPC → message for the UPCs we sent.
function parseReport(buf: Buffer, upcs: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }).map((r) => r.map((c) => String(c ?? '')));
  let errCol = -1;
  for (let i = 0; i < Math.min(5, grid.length) && errCol < 0; i++) errCol = grid[i].findIndex((c) => /error|message|reason/i.test(c));
  for (const row of grid) {
    const upc = row.map(norm).find((c) => upcs.has(c));
    if (!upc) continue;
    const msg = (errCol >= 0 ? row[errCol] : '') || row.filter((c) => /error|invalid|required|must|not /i.test(c)).join(' | ');
    out.set(upc, msg || 'Rejected by marketplace');
  }
  return out;
}

export async function pollSubmission(subId: string) {
  const sub = await db.submission.findUnique({ where: { id: subId } });
  if (!sub?.importId || sub.status !== 'processing') return;
  const s = await importStatus(sub.channelKey, sub.importId);
  const st = s.import_status;
  if (!['COMPLETE', 'FAILED', 'TRANSFORMATION_FAILED', 'CANCELLED'].includes(st)) {
    await db.submission.update({ where: { id: sub.id }, data: { statusDetail: st, lastCheckedAt: new Date() } });
    return;
  }

  const listings = await db.pendingChange.findMany({ where: { submissionId: sub.id }, select: { id: true, product: { select: { gtin: true, title: true } } } });
  const images = await db.imageChange.findMany({ where: { submissionId: sub.id } });
  const edits = await db.nordstromEdit.findMany({ where: { submissionId: sub.id } });
  const sentUpcs = new Set<string>([...listings.map((l) => norm(l.product.gtin)), ...images.flatMap((i) => (i.gtins as string[]).map(norm)), ...edits.flatMap((e) => (e.gtins as string[]).map(norm))]);

  const rejected = new Map<string, string>();
  let reportFile: string | null = null, reportName: string | null = null;
  const reports: { kind: string; name: string; file: string }[] = [];
  for (const kind of ['transformation_error_report', 'error_report'] as const) {
    if (!(kind === 'error_report' ? s.has_error_report : s.has_transformation_error_report)) continue;
    try {
      const rep = await importReport(sub.channelKey, sub.importId, kind);
      reportFile = rep.buffer.toString('base64');
      reportName = `${sub.channelKey}-${sub.importId}-${kind}.${/csv|text/.test(rep.type) ? 'csv' : 'xlsx'}`;
      reports.push({ kind, name: reportName, file: reportFile });
      for (const [u, m] of parseReport(rep.buffer, sentUpcs)) rejected.set(u, m);
    } catch { /* keep going with what we have */ }
  }
  const failedWhole = st !== 'COMPLETE' && rejected.size === 0;
  const reason = s.reason_status || st;
  const rejRows: { upc: string; title: string; message: string }[] = [];
  let acc = 0, rej = 0;

  const acceptedIds: string[] = [];
  for (const l of listings) {
    const msg = failedWhole ? reason : rejected.get(norm(l.product.gtin));
    if (msg) {
      rej++; rejRows.push({ upc: l.product.gtin, title: l.product.title, message: msg });
      await db.pendingChange.update({ where: { id: l.id }, data: { approval: 'pending', sendStatus: 'rejected', sendError: msg } });
    } else { acc++; acceptedIds.push(l.id); }
  }
  if (acceptedIds.length) await db.pendingChange.updateMany({ where: { id: { in: acceptedIds } }, data: { sendStatus: 'accepted' } });

  for (const i of images) {
    const gtins = i.gtins as string[];
    const msgs = gtins.map((g) => (failedWhole ? reason : rejected.get(norm(g)))).filter(Boolean) as string[];
    if (msgs.length) {
      rej += msgs.length; acc += gtins.length - msgs.length;
      gtins.forEach((g) => { const m = failedWhole ? reason : rejected.get(norm(g)); if (m) rejRows.push({ upc: g, title: `${i.title} ${i.color} — images`, message: m }); });
      await db.imageChange.update({ where: { id: i.id }, data: { status: 'pending', sendStatus: 'rejected', sendError: msgs[0] } });
    } else {
      acc += gtins.length;
      await db.imageChange.update({ where: { id: i.id }, data: { sendStatus: 'accepted' } });
    }
  }

  for (const ed of edits) {
    const gt = ed.gtins as string[];
    const msgs = gt.map((g) => (failedWhole ? reason : rejected.get(norm(g)))).filter(Boolean) as string[];
    if (msgs.length) {
      rej += msgs.length; acc += gt.length - msgs.length;
      gt.forEach((g) => { const m = failedWhole ? reason : rejected.get(norm(g)); if (m) rejRows.push({ upc: g, title: ed.title + " " + ed.color + " — Nordstrom edit", message: m }); });
      await db.nordstromEdit.update({ where: { id: ed.id }, data: { status: "rejected", sendError: msgs[0] } });
    } else {
      acc += gt.length;
      await db.nordstromEdit.update({ where: { id: ed.id }, data: { status: "accepted", sendError: null } });
    }
  }
  await db.submission.update({
    where: { id: sub.id },
    data: { status: failedWhole ? 'failed' : 'complete', statusDetail: reason, accepted: acc, rejected: rej, errorReport: rejRows, reportFile, reportName, reports, completedAt: new Date(), lastCheckedAt: new Date() },
  });
  await log("status", sub.channelKey + " import " + sub.importId + " finished: " + (failedWhole ? "failed — " + reason : acc + " accepted, " + rej + " rejected"), failedWhole || rej ? "warn" : "info");
}

export async function pollOpen(channelKey?: string) {
  const cutoff = new Date(Date.now() - 30_000);
  const open = await db.submission.findMany({
    where: { status: 'processing', importId: { not: null }, ...(channelKey ? { channelKey } : {}), OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
    select: { id: true },
  });
  for (const o of open) {
    try { await pollSubmission(o.id); }
    catch (e) { await db.submission.update({ where: { id: o.id }, data: { statusDetail: `Check failed: ${(e as Error).message}`, lastCheckedAt: new Date() } }); }
  }
}

export async function autoPushMap(): Promise<Record<string, boolean>> {
  return ((await db.setting.findUnique({ where: { key: 'autoPush' } }))?.value as Record<string, boolean>) ?? {};
}

export async function autoPushTick() {
  const map = await autoPushMap();
  for (const [channelKey, on] of Object.entries(map)) {
    if (!on) continue;
    const r = await readyToSend(channelKey);
    if (!r.sizes && !r.images) continue;
    if (await nextAllowedAt(channelKey)) continue;
    try { await sendChannel(channelKey, "auto"); } catch (e) { await log("push", "Auto-push to " + channelKey + " not sent: " + (e as Error).message, "warn"); }
  }
}
