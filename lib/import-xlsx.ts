import * as XLSX from 'xlsx';
import { createHash } from 'crypto';
import { db } from './db';
import { channelColumns, channelSizeOf } from './channel-specs';
import { diffRows } from './diff';

type Row = Record<string, string>;

export function parseMiraklExport(buffer: Buffer): { codes: string[]; rows: Row[] } {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets['Data'] ?? wb.Sheets[wb.SheetNames[0]];
  const r = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  r.s.r = 0; r.s.c = 0;
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', range: XLSX.utils.encode_range(r) });
  const codes = (grid[1] ?? []).map((c) => String(c ?? '').trim());
  const rows: Row[] = [];
  for (let i = 2; i < grid.length; i++) {
    const line = grid[i];
    if (!line || line.every((v) => v === '' || v == null)) continue;
    const row: Row = {};
    codes.forEach((code, j) => { if (code) row[code] = line[j] == null ? '' : String(line[j]).trim(); });
    rows.push(row);
  }
  return { codes, rows };
}

// Reads a manual export (xlsx, labels + codes rows) or a Mirakl API file (csv, one codes row).
export function parseProductFile(buffer: Buffer, keyCode: string): { codes: string[]; rows: Row[] } {
  let wb: XLSX.WorkBook;
  if (buffer.subarray(0, 2).toString('latin1') === 'PK') {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } else {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/, 1)[0] ?? '';
    const semi = first.split(';').length, comma = first.split(',').length, tab = first.split('\t').length;
    const FS = tab > semi && tab > comma ? '\t' : semi >= comma ? ';' : ',';
    wb = XLSX.read(text, { type: 'string', FS, raw: true });
  }
  const ws = wb.Sheets['Data'] ?? wb.Sheets[wb.SheetNames[0]];
  const r = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  r.s.r = 0; r.s.c = 0;
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', range: XLSX.utils.encode_range(r), raw: false }).map((row) => row.map((v) => String(v ?? '').trim()));
  const h = grid.slice(0, 4).findIndex((row) => row.includes(keyCode));
  if (h < 0) return { codes: [], rows: [] };
  const codes = grid[h];
  const rows: Row[] = [];
  for (let i = h + 1; i < grid.length; i++) {
    const line = grid[i];
    if (!line || line.every((v) => v === '')) continue;
    const row: Row = {};
    codes.forEach((code, j) => { if (code) row[code] = line[j] ?? ''; });
    rows.push(row);
  }
  return { codes, rows };
}

const hash = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const pick = (row: Row, keys: string[]) => keys.map((k) => row[k]).filter((v) => v && v.startsWith('http'));
const chunk = <T,>(arr: T[], n = 300) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const looksLikeUpc = (v: string) => /^\d{11,14}$/.test(v);
const cleanUrl = (u: string) => (u || '').split('?')[0];

function readUpc(row: Row, primary: string, alt?: string): { upc: string; sku: string | null } {
  const a = row[primary] ?? '', b = alt ? row[alt] ?? '' : '';
  if (looksLikeUpc(a)) return { upc: a, sku: b && !looksLikeUpc(b) ? b : null };
  if (looksLikeUpc(b)) return { upc: b, sku: a && !looksLikeUpc(a) ? a : null };
  return { upc: '', sku: a || b || null };
}

// "How products are matched across marketplaces" from Connections.
async function matchMode() {
  const m = ((await db.setting.findUnique({ where: { key: 'match' } }))?.value as { byUpc?: boolean; bySku?: boolean }) ?? {};
  return { byUpc: m.byUpc !== false, bySku: !!m.bySku };
}

function matcher(rows: { upc: string; channelSku: string | null }[], mode: { byUpc: boolean; bySku: boolean }) {
  const upcs = new Set(rows.map((r) => r.upc));
  const skus = new Set(rows.map((r) => r.channelSku).filter(Boolean) as string[]);
  return (upc: string, sku?: string | null) => (mode.byUpc && upcs.has(upc)) || (mode.bySku && !!sku && skus.has(sku));
}

async function destinations() {
  const conns = await db.channelConnection.findMany({ where: { enabled: true, lastTestOk: true } });
  const keys = conns.map((c) => c.channelKey).filter((k) => k !== 'nordstrom');
  const chans = await db.channel.findMany({ where: { key: { in: keys } } });
  const mode = await matchMode();
  const listedBy = new Map<string, (upc: string, sku?: string | null) => boolean>();
  for (const ch of chans) {
    const rows = await db.channelProduct.findMany({ where: { channelKey: ch.key }, select: { upc: true, channelSku: true } });
    listedBy.set(ch.id, matcher(rows, mode));
  }
  return { chans, isListed: (chId: string, upc: string, sku?: string | null) => listedBy.get(chId)?.(upc, sku) ?? false };
}

export async function importNordstrom(buffer: Buffer, fileName: string, source: 'manual' | 'auto' = 'manual', exclude?: Set<string>) {
  const c = channelColumns.nordstrom;
  const parsedFile = parseProductFile(buffer, c.upc);
  const rows = exclude?.size ? parsedFile.rows.filter((r) => !exclude.has(r[c.upc])) : parsedFile.rows;
  const { chans, isListed } = await destinations();

  const existing = new Map((await db.product.findMany({ select: { id: true, gtin: true, contentHash: true } })).map((p) => [p.gtin, p]));
  const ignored = new Set((await db.ignoredItem.findMany({ select: { channelKey: true, gtin: true } })).map((i) => `${i.channelKey}|${i.gtin}`));
  const styleOf = (row: Row) => row['variant-group-code'] || row['vpn'] || row[c.sku] || row[c.upc];

  type Prepared = { gtin: string; row: Row; images: string[]; contentHash: string; fields: Record<string, unknown>; isNew: boolean; isChanged: boolean };
  const prepared: Prepared[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const gtin = row[c.upc];
    if (!gtin || seen.has(gtin)) continue;
    seen.add(gtin);
    const attrs: Row = {};
    for (const [k, v] of Object.entries(row)) if (v) attrs[k] = v;
    const images = pick(row, c.images);
    const contentHash = hash({ attrs, images });
    const prev = existing.get(gtin);
    const fields = {
      sku: row[c.sku] || null, title: row[c.title] || '', description: row['copy-description'] || null,
      brand: row['product-label-name'] || 'Menina Step', color: row[c.color] || null,
      material: row['material-shoe-upper'] || row['material-1'] || null,
      categoryRaw: row[c.category] || null, attrs, contentHash,
    };
    prepared.push({ gtin, row, images, contentHash, fields, isNew: !prev, isChanged: !!prev && prev.contentHash !== contentHash });
  }

  const fresh = prepared.filter((p) => p.isNew);
  const changed = prepared.filter((p) => p.isChanged);
  const affected = [...fresh, ...changed];

  for (const part of chunk(fresh)) await db.product.createMany({ data: part.map((p) => ({ gtin: p.gtin, ...p.fields })) as never, skipDuplicates: true });
  for (const p of changed) await db.product.update({ where: { gtin: p.gtin }, data: p.fields as never });

  const idByGtin = new Map((await db.product.findMany({ select: { id: true, gtin: true } })).map((p) => [p.gtin, p.id]));

  const prevSnap = new Map<string, Row>();
  if (changed.length) {
    const snaps = await db.snapshot.findMany({ where: { productId: { in: changed.map((p) => idByGtin.get(p.gtin)!) } }, orderBy: { pulledAt: 'desc' }, select: { productId: true, payload: true } });
    for (const s of snaps) if (!prevSnap.has(s.productId)) prevSnap.set(s.productId, s.payload as Row);
  }

  if (affected.length) {
    const affectedIds = affected.map((p) => idByGtin.get(p.gtin)!);
    for (const part of chunk(affected)) await db.snapshot.createMany({ data: part.map((p) => ({ productId: idByGtin.get(p.gtin)!, payload: p.row, contentHash: p.contentHash })) });
    await db.productImage.deleteMany({ where: { productId: { in: affectedIds } } });
    const imageRows = affected.flatMap((p) => p.images.map((url, i) => ({
      productId: idByGtin.get(p.gtin)!, position: i, role: i === 0 ? 'hero' : 'alt', sourceUrl: url,
      contentHash: hash(cleanUrl(url)), width: 0, height: 0, bytes: 0, mime: 'image/jpeg',
    })));
    for (const part of chunk(imageRows, 500)) await db.productImage.createMany({ data: part });
  }

  // Queue: new listings only, and only for the products in this file.
  const decided = new Set((await db.pendingChange.findMany({ where: { approval: { not: 'pending' } }, select: { productId: true, channelId: true, changeType: true } })).map((d) => `${d.productId}|${d.channelId}|${d.changeType}`));
  await db.pendingChange.deleteMany({ where: { approval: 'pending', productId: { in: prepared.map((p) => idByGtin.get(p.gtin)!) } } });

  const pending = [];
  let skippedIgnored = 0;
  for (const p of prepared) {
    const productId = idByGtin.get(p.gtin)!;
    for (const ch of chans) {
      if (ignored.has(`${ch.key}|${p.gtin}`)) { skippedIgnored++; continue; }
      if (isListed(ch.id, p.gtin, p.row[c.sku])) continue;
      if (decided.has(`${productId}|${ch.id}|new`)) continue;
      pending.push({ productId, channelId: ch.id, changeType: 'new', fieldDiffs: diffRows(null, p.row, [], p.images), outputRow: {}, validation: 'valid', source });
    }
  }
  for (const part of chunk(pending, 500)) await db.pendingChange.createMany({ data: part });

  // Image changes, when the watch is on.
  let imageChanges = 0;
  const watch = (await db.setting.findUnique({ where: { key: 'imageWatch' } }))?.value as { enabled?: boolean } | undefined;
  if (watch?.enabled && changed.length) {
    const colours = new Map<string, { style: string; color: string; title: string; category: string; gtins: string[] }>();
    for (const p of prepared) {
      const k = `${styleOf(p.row)}|${p.row[c.color] ?? ''}`;
      if (!colours.has(k)) colours.set(k, { style: styleOf(p.row), color: p.row[c.color] ?? '', title: p.row[c.title] ?? '', category: p.row[c.category] ?? '', gtins: [] });
      colours.get(k)!.gtins.push(p.gtin);
    }
    const perColour = new Map<string, { positions: Set<number>; newImages: string[] }>();
    for (const p of changed) {
      const prevRow = prevSnap.get(idByGtin.get(p.gtin)!);
      if (!prevRow) continue;
      const before = pick(prevRow, c.images).map(cleanUrl), after = p.images.map(cleanUrl);
      const pos: number[] = [];
      for (let i = 0; i < Math.max(before.length, after.length); i++) if (before[i] !== after[i]) pos.push(i + 1);
      if (!pos.length) continue;
      const k = `${styleOf(p.row)}|${p.row[c.color] ?? ''}`;
      const e = perColour.get(k) ?? { positions: new Set<number>(), newImages: p.images };
      pos.forEach((x) => e.positions.add(x));
      perColour.set(k, e);
    }
    if (perColour.size) {
      const chRows = await db.channelProduct.findMany({ where: { channelKey: { in: chans.map((x) => x.key) } }, select: { channelKey: true, upc: true, images: true } });
      const imgBy = new Map(chRows.map((r) => [`${r.channelKey}|${r.upc}`, r.images as string[]]));
      for (const [k, e] of perColour) {
        const cg = colours.get(k);
        if (!cg) continue;
        for (const ch of chans) {
          const gtins = cg.gtins.filter((g) => imgBy.has(`${ch.key}|${g}`) && !ignored.has(`${ch.key}|${g}`));
          if (!gtins.length) continue;
          const oldImages = imgBy.get(`${ch.key}|${gtins[0]}`) ?? [];
          const open = await db.imageChange.findFirst({ where: { channelKey: ch.key, styleCode: cg.style, color: cg.color, status: 'pending' } });
          const positions = [...new Set([...((open?.positions as number[]) ?? []), ...e.positions])].sort((a, b) => a - b);
          const data = { title: cg.title, category: cg.category, gtins, positions, oldImages, newImages: e.newImages, images: [], source, detectedAt: new Date() };
          if (open) await db.imageChange.update({ where: { id: open.id }, data });
          else await db.imageChange.create({ data: { channelKey: ch.key, styleCode: cg.style, color: cg.color, ...data } });
          imageChanges++;
        }
      }
    }
  }

  await db.importRun.create({ data: { channelKey: 'nordstrom', fileName, rowCount: prepared.length, newCount: fresh.length, changedCount: changed.length, source, queued: pending.length, imageChanges } });
  return { rows: prepared.length, newCount: fresh.length, changedCount: changed.length, queued: pending.length, skippedIgnored, imageChanges };
}

export async function importChannel(channelKey: string, buffer: Buffer, fileName: string, source: 'manual' | 'auto' = 'manual') {
  const c = channelColumns[channelKey];
  if (!c) throw new Error(`Unknown channel ${channelKey}`);
  const { rows } = parseMiraklExport(buffer);
  const seen = new Set<string>();
  const data = [];
  let skipped = 0;
  const dupes = new Map<string, number>();
  for (const row of rows) {
    const { upc, sku } = readUpc(row, c.upc, c.altUpc);
    if (!upc) { skipped++; continue; }
    if (seen.has(upc)) { dupes.set(upc, (dupes.get(upc) ?? 1) + 1); continue; }
    seen.add(upc);
    data.push({
      channelKey, upc, channelSku: sku ?? (row[c.sku] || null), styleCode: row[c.style] || null, color: row[c.color] || null,
      size: channelSizeOf(channelKey, row), category: row[c.category] || null, title: row[c.title] || null,
      images: pick(row, c.images), swatchUrl: c.swatch ? row[c.swatch] || null : null, raw: row,
    });
  }
  if (data.length > 0) {
    await db.channelProduct.deleteMany({ where: { channelKey } });
    for (const part of chunk(data)) await db.channelProduct.createMany({ data: part });
  }
  const dupeList = [...dupes].map(([upc, n]) => ({ upc, n }));
  await db.setting.upsert({ where: { key: "dupes:" + channelKey }, update: { value: dupeList }, create: { key: "dupes:" + channelKey, value: dupeList } });
  await db.importRun.create({ data: { channelKey, fileName, rowCount: data.length, source } });
  const rescan = await rescanChannel(channelKey, source);
  return { rows: data.length, skippedNoUpc: skipped, ...rescan };
}

// Compare one marketplace against the current Nordstrom catalogue: queue what's missing, clear what's now listed.
export async function rescanChannel(channelKey: string, source: 'manual' | 'auto' = 'manual') {
  const ch = await db.channel.findUnique({ where: { key: channelKey } });
  if (!ch || channelKey === 'nordstrom') return { queuedNew: 0, cleared: 0 };
  const [listedRows, products, ignoredRows, existing, mode] = await Promise.all([
    db.channelProduct.findMany({ where: { channelKey }, select: { upc: true, channelSku: true } }),
    db.product.findMany({ select: { id: true, gtin: true, sku: true } }),
    db.ignoredItem.findMany({ where: { channelKey }, select: { gtin: true } }),
    db.pendingChange.findMany({ where: { channelId: ch.id }, select: { productId: true, changeType: true, approval: true } }),
    matchMode(),
  ]);
  const isListed = matcher(listedRows, mode);
  const ignored = new Set(ignoredRows.map((r) => r.gtin));
  const byId = new Map(products.map((p) => [p.id, p]));
  const alreadyNew = new Set(existing.filter((e) => e.changeType === 'new').map((e) => e.productId));

  const nowListed = existing.filter((e) => { const p = byId.get(e.productId); return e.changeType === 'new' && e.approval === 'pending' && !!p && isListed(p.gtin, p.sku); }).map((e) => e.productId);
  const cleared = nowListed.length ? (await db.pendingChange.deleteMany({ where: { channelId: ch.id, changeType: 'new', approval: 'pending', productId: { in: nowListed } } })).count : 0;
  const toAdd = products.filter((p) => !isListed(p.gtin, p.sku) && !ignored.has(p.gtin) && !alreadyNew.has(p.id));
  for (const part of chunk(toAdd, 500)) {
    await db.pendingChange.createMany({ data: part.map((p) => ({ productId: p.id, channelId: ch.id, changeType: 'new', fieldDiffs: [], outputRow: {}, validation: 'valid', source })) });
  }
  return { queuedNew: toAdd.length, cleared };
}
