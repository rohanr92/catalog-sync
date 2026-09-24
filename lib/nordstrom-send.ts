import * as XLSX from 'xlsx';
import { db } from './db';
import { channelColumns, OFFER_COLUMNS } from './channel-specs';
import { getColumnSpecs } from './static-data';
import { uploadProducts, RateLimited } from './mirakl';
import { log } from './log';

type Row = Record<string, string>;
const GAP = 15 * 60_000;

// Nordstrom's current row for this UPC, with your edits on top.
export function applyEdit(attrs: Row, gtin: string, images: string[], fields: Record<string, Row>): Row {
  const row: Row = { ...attrs };
  if (images.length) channelColumns.nordstrom.images.forEach((col, i) => { row[col] = images[i] ?? ''; });
  Object.assign(row, fields['*'] ?? {}, fields[gtin] ?? {});
  return row;
}

export async function sendNordstrom(source: 'manual' | 'auto') {
  const ch = await db.channel.findUnique({ where: { key: 'nordstrom' } });
  if (!ch) throw new Error('Nordstrom channel missing — run the seed');
  const last = await db.submission.findFirst({ where: { channelKey: 'nordstrom', importId: { not: null } }, orderBy: { sentAt: 'desc' } });
  if (last && Date.now() - last.sentAt.getTime() < GAP) throw new Error(`Nordstrom accepts one product file every 15 minutes. Next send from ${new Date(last.sentAt.getTime() + GAP).toLocaleTimeString()}.`);

  const edits = await db.nordstromEdit.findMany({ where: { status: 'approved' } });
  if (!edits.length) return { submissions: 0, rows: 0, skipped: 0, errors: [] as string[] };
  const products = await db.product.findMany({ where: { gtin: { in: edits.flatMap((e) => e.gtins as string[]) } }, select: { gtin: true, attrs: true, categoryRaw: true } });
  const byG = new Map(products.map((p) => [p.gtin, p]));
  const picked: { row: Row; category: string; editId: string }[] = [];
  for (const e of edits) for (const g of e.gtins as string[]) {
    const p = byG.get(g);
    if (p) picked.push({ row: applyEdit(p.attrs as Row, g, e.images as string[], e.fields as Record<string, Row>), category: p.categoryRaw ?? '', editId: e.id });
  }

  const tpls = (await db.setting.findMany({ where: { key: { startsWith: 'template:nordstrom:' } } })).map((t) => t.value as { codes: string[]; categories: string[] });
  const label = new Map((await getColumnSpecs('nordstrom')).map((s) => [s.code, s.label]));
  const byTpl = new Map<number, typeof picked>();
  for (const p of picked) { let i = tpls.findIndex((t) => t.categories.includes(p.category)); if (i < 0) i = 0; if (!byTpl.has(i)) byTpl.set(i, []); byTpl.get(i)!.push(p); }

  let sent = 0, subs = 0;
  const errors: string[] = [];
  for (const [i, items] of byTpl) {
    const codes = (tpls[i]?.codes ?? Object.keys(items[0].row)).filter((c) => c && !OFFER_COLUMNS.has(c));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([codes.map((c) => label.get(c) ?? c), codes, ...items.map((x) => codes.map((c) => x.row[c] ?? ''))]), 'Data');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const fileName = `nordstrom-edits-${items.length}-rows-${Date.now()}.xlsx`;
    try {
      const importId = await uploadProducts('nordstrom', buf, fileName);
      const sub = await db.submission.create({ data: { channelId: ch.id, channelKey: 'nordstrom', importId, rowCount: items.length, status: 'processing', kind: 'nordstrom-edit', source, fileUrl: fileName } });
      await db.nordstromEdit.updateMany({ where: { id: { in: [...new Set(items.map((x) => x.editId))] } }, data: { status: 'sent', submissionId: sub.id, sendError: null } });
      sent += items.length; subs++;
    } catch (e) {
      const msg = (e as Error).message;
      await db.submission.create({ data: { channelId: ch.id, channelKey: 'nordstrom', rowCount: items.length, status: 'failed', kind: 'nordstrom-edit', source, statusDetail: msg, completedAt: new Date() } });
      errors.push(msg);
      if (e instanceof RateLimited) break;
    }
  }
  await log('push', (source === 'auto' ? 'Auto-push' : 'Manual send') + ' to Nordstrom: ' + sent + ' rows in ' + subs + ' file(s)' + (errors.length ? ' — ' + errors[0] : ''), errors.length ? 'warn' : 'info');
  return { submissions: subs, rows: sent, skipped: 0, errors };
}
