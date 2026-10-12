import { db } from './db';
import { log } from './log';
import { getCfg, pullAll, connectedChannels, nameOf } from './inventory';

// Runs every minute (instrumentation.ts):
//  • a new order on any marketplace → full inventory pull N minutes later
//  • otherwise a full pull every X minutes

export interface JobState { lastFull: string | null; lastReason: string | null; pendingAt: string | null; pendingWhy: string | null; lastOrderCheck: Record<string, string>; lastResult: string | null }
const KEY = 'invJob';
export async function getJob(): Promise<JobState> {
  const v = (await db.setting.findUnique({ where: { key: KEY } }))?.value as unknown as Partial<JobState> | undefined;
  return { lastFull: null, lastReason: null, pendingAt: null, pendingWhy: null, lastOrderCheck: {}, lastResult: null, ...(v ?? {}) };
}
async function saveJob(s: JobState) { await db.setting.upsert({ where: { key: KEY }, update: { value: s as never }, create: { key: KEY, value: s as never } }); }

// OR11 — orders created on this marketplace since `since`.
async function newOrders(ch: string, since: string): Promise<number> {
  const c = await db.channelConnection.findUnique({ where: { channelKey: ch } });
  if (!c?.apiUrl || !c.apiKey) return 0;
  const q = new URLSearchParams({ start_date: since, max: '10' });
  if (c.shopId) q.set('shop_id', c.shopId);
  const res = await fetch(`${c.apiUrl.replace(/\/+$/, '')}/api/orders?${q}`, { headers: { Authorization: c.apiKey, Accept: 'application/json' } });
  if (!res.ok) return 0;
  const j = await res.json();
  return Number(j.total_count ?? (j.orders ?? []).length ?? 0);
}

let running = false;
export async function inventoryTick() {
  if (running) return;
  running = true;
  try {
    const cfg = await getCfg();
    const every = cfg.autoMinutes ?? 10;
    const onOrder = cfg.orderTrigger !== false;
    const delay = cfg.orderDelay ?? 2;
    if (!every && !onOrder) return;
    const s = await getJob();
    const now = new Date();

    if (onOrder) {
      for (const ch of await connectedChannels()) {
        const since = s.lastOrderCheck[ch] ?? new Date(now.getTime() - 2 * 60_000).toISOString();
        try {
          const n = await newOrders(ch, since);
          if (n > 0 && !s.pendingAt) { s.pendingAt = new Date(now.getTime() + delay * 60_000).toISOString(); s.pendingWhy = `${n} new ${nameOf(ch)} order${n === 1 ? '' : 's'}`; }
        } catch { /* try again next minute */ }
        s.lastOrderCheck[ch] = now.toISOString();
      }
    }

    const due = s.pendingAt && new Date(s.pendingAt) <= now
      ? s.pendingWhy ?? 'new order'
      : every && (!s.lastFull || now.getTime() - new Date(s.lastFull).getTime() >= every * 60_000) ? `every ${every} min` : null;

    if (due) {
      const r = await pullAll();
      s.lastFull = new Date().toISOString();
      s.lastReason = due;
      s.lastResult = Object.entries(r).map(([k, v]) => `${nameOf(k)}: ${v}`).join(' · ');
      s.pendingAt = null; s.pendingWhy = null;
      if (due !== `every ${every} min`) await log('pull', `Inventory pulled after ${due}`);
    }
    await saveJob(s);
  } finally {
    running = false;
  }
}
