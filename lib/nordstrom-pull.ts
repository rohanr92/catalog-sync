import { log } from "./log";
import { db } from './db';
import { importNordstrom } from './import-xlsx';

export interface PullCfg {
  enabled?: boolean; intervalMin?: number; lastRequestDate?: string | null; lastRunAt?: string | null;
  lastResult?: string | null; lastOk?: boolean | null;
  seen?: number[];          // imports already pulled
  awaitingFinal?: number[]; // pulled at SENT, waiting for Nordstrom's final result
}
interface Tracking { import_id: number; import_status: string; date_created: string; has_transformed_file?: boolean; has_error_report?: boolean }

const FINAL_BAD = ['FAILED', 'CANCELLED', 'TRANSFORMATION_FAILED'];

export async function getPullCfg(): Promise<PullCfg> {
  return ((await db.setting.findUnique({ where: { key: 'nordstromPull' } }))?.value as PullCfg) ?? {};
}
export async function savePullCfg(v: PullCfg) {
  await db.setting.upsert({ where: { key: 'nordstromPull' }, update: { value: v as never }, create: { key: 'nordstromPull', value: v as never } });
}

async function nordstrom() {
  const c = await db.channelConnection.findUnique({ where: { channelKey: 'nordstrom' } });
  if (!c?.apiUrl || !c.apiKey) throw new Error('Nordstrom API URL / key missing under Connections');
  return { base: c.apiUrl.replace(/\/+$/, ''), key: c.apiKey, shopId: c.shopId ?? '' };
}

async function getFile(url: string, key: string) {
  const res = await fetch(url, { headers: { Authorization: key, Accept: '*/*' } });
  if (!res.ok) throw new Error(`${url.split('/api/')[1]} failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// Remove what an import created, for the UPCs Nordstrom refused (or everything if the import failed).
async function undoRejected(importId: string, rejected: Set<string> | 'all') {
  const products = await db.product.findMany({ where: rejected === 'all' ? {} : { gtin: { in: [...rejected] } }, select: { id: true } });
  const removedListings = (await db.pendingChange.deleteMany({
    where: { originImport: importId, approval: 'pending', ...(rejected === 'all' ? {} : { productId: { in: products.map((p) => p.id) } }) },
  })).count;
  let removedImages = 0;
  const changes = await db.imageChange.findMany({ where: { originImport: importId, status: 'pending' } });
  for (const c of changes) {
    const keep = rejected === 'all' ? [] : (c.gtins as string[]).filter((g) => !rejected.has(g));
    if (!keep.length) { await db.imageChange.delete({ where: { id: c.id } }); removedImages++; }
    else if (keep.length !== (c.gtins as string[]).length) await db.imageChange.update({ where: { id: c.id }, data: { gtins: keep } });
  }
  return { removedListings, removedImages };
}

export async function pullNordstrom(source: 'auto' | 'manual' = 'auto') {
  const cfg = await getPullCfg();
  const { base, key, shopId } = await nordstrom();
  const startedAt = new Date();
  const since = cfg.lastRequestDate ?? startedAt.toISOString();
  const shopQ = shopId ? `?shop_id=${encodeURIComponent(shopId)}` : '';

  // P51 — imports that changed since the last check (new ones, and status changes on earlier ones).
  const trackings: Tracking[] = [];
  for (let offset = 0; offset <= 2000; offset += 100) {
    const q = new URLSearchParams({ last_request_date: since, max: '100', offset: String(offset) });
    if (shopId) q.set('shop_id', shopId);
    const res = await fetch(`${base}/api/products/imports?${q}`, { headers: { Authorization: key, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nordstrom import list failed (${res.status})`);
    const list: Tracking[] = (await res.json()).product_import_trackings ?? [];
    trackings.push(...list);
    if (list.length < 100) break;
  }

  const seen = new Set(cfg.seen ?? []);
  const awaiting = new Set(cfg.awaitingFinal ?? []);
  const notes: string[] = [];

  // 1. Pull new imports as soon as their rows exist (SENT), not only at COMPLETE.
  const todo = trackings
    .filter((t) => ['SENT', 'COMPLETE'].includes(t.import_status) && t.has_transformed_file && !seen.has(t.import_id))
    .sort((a, b) => a.date_created.localeCompare(b.date_created));

  let rows = 0, queued = 0, imageChanges = 0;
  for (const t of todo) {
    const file = await getFile(`${base}/api/products/imports/${t.import_id}/transformed_file${shopQ}`, key);
    const exclude = new Set<string>();
    if (t.import_status === 'COMPLETE' && t.has_error_report) {
      try { for (const m of (await getFile(`${base}/api/products/imports/${t.import_id}/error_report${shopQ}`, key)).toString('utf8').matchAll(/\b\d{11,14}\b/g)) exclude.add(m[0]); } catch { /* keep going */ }
    }
    const runStart = new Date();
    const r = await importNordstrom(file, `nordstrom-api-import-${t.import_id}.csv`, source === 'manual' ? 'manual' : 'auto', exclude);
    // Tag what this import created, so it can be undone if Nordstrom rejects it later.
    const id = String(t.import_id);
    await db.pendingChange.updateMany({ where: { detectedAt: { gte: runStart }, originImport: null }, data: { originImport: id } });
    await db.imageChange.updateMany({ where: { detectedAt: { gte: runStart }, originImport: null }, data: { originImport: id } });
    rows += r.rows; queued += r.queued; imageChanges += r.imageChanges;
    seen.add(t.import_id);
    if (t.import_status === 'SENT') awaiting.add(t.import_id);
  }

  // 2. Imports pulled at SENT that have now finished on Nordstrom.
  for (const t of trackings) {
    if (!awaiting.has(t.import_id)) continue;
    const id = String(t.import_id);
    if (FINAL_BAD.includes(t.import_status)) {
      const u = await undoRejected(id, 'all');
      notes.push(`import ${id} ${t.import_status.toLowerCase()} on Nordstrom — removed ${u.removedListings} listings, ${u.removedImages} image changes`);
      awaiting.delete(t.import_id);
    } else if (t.import_status === 'COMPLETE') {
      if (t.has_error_report) {
        const rejected = new Set<string>();
        try { for (const m of (await getFile(`${base}/api/products/imports/${t.import_id}/error_report${shopQ}`, key)).toString('utf8').matchAll(/\b\d{11,14}\b/g)) rejected.add(m[0]); } catch { /* try again next pull */ continue; }
        if (rejected.size) {
          const u = await undoRejected(id, rejected);
          notes.push(`import ${id}: Nordstrom rejected ${rejected.size} UPCs — removed ${u.removedListings} listings, ${u.removedImages} image changes`);
        }
      }
      awaiting.delete(t.import_id);
    }
  }

  const parts = [todo.length ? `${todo.length} Nordstrom import${todo.length === 1 ? '' : 's'} pulled — ${rows} rows, ${queued} queued, ${imageChanges} image changes` : `Checked — nothing new (${trackings.length} imports looked at)`];
  if (awaiting.size) parts.push(`${awaiting.size} waiting for Nordstrom to finish`);
  parts.push(...notes);
  const summary = parts.join(' · ');
  await savePullCfg({
    ...cfg, lastRequestDate: new Date(startedAt.getTime() - 60_000).toISOString(), lastRunAt: startedAt.toISOString(),
    lastResult: summary, lastOk: true, seen: [...seen].slice(-500), awaitingFinal: [...awaiting],
  });
  await log("pull", (source === "auto" ? "Auto" : "Manual") + " pull: " + summary, notes.length ? "warn" : "info");
  return { checked: trackings.length, processed: todo.length, summary };
}

export async function pullTick() {
  const cfg = await getPullCfg();
  if (!cfg.enabled) return;
  const every = (cfg.intervalMin ?? 15) * 60_000;
  if (cfg.lastRunAt && Date.now() - new Date(cfg.lastRunAt).getTime() < every) return;
  try { await pullNordstrom('auto'); }
  catch (e) { await log("pull", "Pull failed: " + (e as Error).message, "error"); await savePullCfg({ ...cfg, lastRunAt: new Date().toISOString(), lastResult: `Failed: ${(e as Error).message}`, lastOk: false }); }
}
