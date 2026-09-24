import { db } from './db';
import { channelColumns, channelSizeOf } from './channel-specs';
import { parseProductFile, rescanChannel } from './import-xlsx';
import { log } from './log';

type Row = Record<string, string>;
export interface ChPullCfg { enabled?: boolean; intervalMin?: number; lastRequestDate?: string | null; lastRunAt?: string | null; lastResult?: string | null; lastOk?: boolean | null; seen?: number[] }
interface Tracking { import_id: number; import_status: string; date_created: string; has_transformed_file?: boolean; has_error_report?: boolean }

const cfgKey = (ch: string) => 'pull:' + ch;
export async function getChPullCfg(ch: string): Promise<ChPullCfg> { return ((await db.setting.findUnique({ where: { key: cfgKey(ch) } }))?.value as ChPullCfg) ?? {}; }
export async function saveChPullCfg(ch: string, v: ChPullCfg) { await db.setting.upsert({ where: { key: cfgKey(ch) }, update: { value: v as never }, create: { key: cfgKey(ch), value: v as never } }); }

const looksLikeUpc = (v: string) => /^\d{11,14}$/.test(v);
function readUpc(row: Row, primary: string, alt?: string): { upc: string; sku: string | null } {
  const a = row[primary] ?? '', b = alt ? row[alt] ?? '' : '';
  if (looksLikeUpc(a)) return { upc: a, sku: b && !looksLikeUpc(b) ? b : null };
  if (looksLikeUpc(b)) return { upc: b, sku: a && !looksLikeUpc(a) ? a : null };
  return { upc: '', sku: null };
}

// Merge rows into the marketplace catalogue without replacing products that aren't in the file.
export async function mergeRows(channelKey: string, rows: Row[], fileName: string, source: 'manual' | 'auto') {
  const c = channelColumns[channelKey];
  let added = 0, updated = 0;
  for (const row of rows) {
    const { upc, sku } = readUpc(row, c.upc, c.altUpc);
    if (!upc) continue;
    const data = {
      channelSku: sku ?? (row[c.sku] || null), styleCode: row[c.style] || null, color: row[c.color] || null, size: channelSizeOf(channelKey, row),
      category: row[c.category] || null, title: row[c.title] || null, images: c.images.map((k) => row[k]).filter((v) => v && v.startsWith('http')), swatchUrl: c.swatch ? row[c.swatch] || null : null,
    };
    const filled = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length)));
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== ''));
    const ex = await db.channelProduct.findFirst({ where: { channelKey, upc }, select: { id: true, raw: true } });
    if (ex) { await db.channelProduct.update({ where: { id: ex.id }, data: { ...filled, raw: { ...(ex.raw as Row), ...clean } } as never }); updated++; }
    else { await db.channelProduct.create({ data: { channelKey, upc, ...data, raw: row } as never }); added++; }
  }
  await db.importRun.create({ data: { channelKey, fileName, rowCount: rows.length, newCount: added, changedCount: updated, source } });
  const rescan = await rescanChannel(channelKey, source);
  return { rows: rows.length, added, updated, ...rescan };
}

async function conn(ch: string) {
  const c = await db.channelConnection.findUnique({ where: { channelKey: ch } });
  if (!c?.apiUrl || !c.apiKey) throw new Error(`${ch}: API URL / key missing under Connections`);
  return { base: c.apiUrl.replace(/\/+$/, ''), key: c.apiKey, shopId: c.shopId ?? '' };
}
async function getFile(url: string, key: string) {
  const res = await fetch(url, { headers: { Authorization: key, Accept: '*/*' } });
  if (!res.ok) throw new Error(`${url.split('/api/')[1]} failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function pullChannel(ch: string, source: 'manual' | 'auto') {
  const spec = channelColumns[ch];
  if (!spec) throw new Error('Unknown marketplace');
  const cfg = await getChPullCfg(ch);
  const { base, key, shopId } = await conn(ch);
  const startedAt = new Date();
  const since = cfg.lastRequestDate ?? startedAt.toISOString();
  const shopQ = shopId ? `?shop_id=${encodeURIComponent(shopId)}` : '';

  const trackings: Tracking[] = [];
  for (let offset = 0; offset <= 2000; offset += 100) {
    const q = new URLSearchParams({ last_request_date: since, max: '100', offset: String(offset) });
    if (shopId) q.set('shop_id', shopId);
    const res = await fetch(`${base}/api/products/imports?${q}`, { headers: { Authorization: key, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${ch} import list failed (${res.status})`);
    const list: Tracking[] = (await res.json()).product_import_trackings ?? [];
    trackings.push(...list);
    if (list.length < 100) break;
  }

  const seen = new Set(cfg.seen ?? []);
  const todo = trackings.filter((t) => t.import_status === 'COMPLETE' && t.has_transformed_file && !seen.has(t.import_id)).sort((a, b) => a.date_created.localeCompare(b.date_created));
  let rows = 0, added = 0, updated = 0;
  for (const t of todo) {
    const file = await getFile(`${base}/api/products/imports/${t.import_id}/transformed_file${shopQ}`, key);
    let parsed = parseProductFile(file, spec.upc);
    if (!parsed.rows.length && spec.altUpc) parsed = parseProductFile(file, spec.altUpc);
    const rejected = new Set<string>();
    if (t.has_error_report) { try { for (const m of (await getFile(`${base}/api/products/imports/${t.import_id}/error_report${shopQ}`, key)).toString('utf8').matchAll(/\b\d{11,14}\b/g)) rejected.add(m[0]); } catch { /* keep going */ } }
    const keep = parsed.rows.filter((r) => !rejected.has(readUpc(r, spec.upc, spec.altUpc).upc));
    const r = await mergeRows(ch, keep, `${ch}-api-import-${t.import_id}.csv`, source);
    rows += r.rows; added += r.added; updated += r.updated;
    seen.add(t.import_id);
  }
  const summary = todo.length ? `${todo.length} ${ch} import(s) pulled — ${rows} rows, ${added} new, ${updated} updated` : `Checked — nothing new (${trackings.length} imports looked at)`;
  await saveChPullCfg(ch, { ...cfg, lastRequestDate: new Date(startedAt.getTime() - 60_000).toISOString(), lastRunAt: startedAt.toISOString(), lastResult: summary, lastOk: true, seen: [...seen].slice(-500) });
  await log('pull', `${source === 'auto' ? 'Auto' : 'Manual'} ${ch} pull: ${summary}`);
  return { summary };
}

export async function channelPullTick() {
  const conns = await db.channelConnection.findMany({ where: { enabled: true, lastTestOk: true } });
  for (const c of conns) {
    if (c.channelKey === 'nordstrom') continue;
    const cfg = await getChPullCfg(c.channelKey);
    if (!cfg.enabled) continue;
    if (cfg.lastRunAt && Date.now() - new Date(cfg.lastRunAt).getTime() < (cfg.intervalMin ?? 15) * 60_000) continue;
    try { await pullChannel(c.channelKey, 'auto'); }
    catch (e) { await saveChPullCfg(c.channelKey, { ...cfg, lastRunAt: new Date().toISOString(), lastResult: `Failed: ${(e as Error).message}`, lastOk: false }); await log('pull', `${c.channelKey} pull failed: ${(e as Error).message}`, 'error'); }
  }
}
