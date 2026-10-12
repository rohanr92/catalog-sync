import { db } from './db';
import { getSnap, normUpc, nameOf } from './inventory';
import { memo } from './memo';

// Go-live tracker: for every Nordstrom style/colour, where it stands on each marketplace —
// queue → approved → sent → accepted → in catalogue → live (with or without stock), or rejected.

export type Stage = 'not_started' | 'ignored' | 'queue' | 'approved' | 'sent' | 'accepted' | 'rejected' | 'listed' | 'oos' | 'live';
const RANK: Record<Stage, number> = { not_started: 0, ignored: 0, queue: 1, approved: 2, sent: 3, rejected: 3, accepted: 4, listed: 5, oos: 6, live: 7 };
const STUCK_DAYS: Partial<Record<Stage, number>> = { queue: 7, approved: 2, sent: 2, accepted: 5, rejected: 3 };

export interface Cell { stage: Stage; counts: Partial<Record<Stage, number>>; since: string | null; stuck: boolean; error: string | null }
export interface Row { key: string; styleCode: string; color: string; title: string; thumb: string; sizes: number; cells: Record<string, Cell> }

export const buildTracker = (fresh = false) => memo('tracker', 60_000, buildTrackerNow, fresh);
async function buildTrackerNow() {
  const channels = (await db.channel.findMany({ where: { isSource: false }, select: { id: true, key: true }, orderBy: { key: 'asc' } })) as { id: string; key: string }[];
  const products = await db.product.findMany({ select: { gtin: true, sku: true, title: true, color: true, attrs: true, images: { orderBy: { position: 'asc' }, take: 1, select: { sourceUrl: true, storedUrl: true } } } });

  // style|colour groups of Nordstrom UPCs
  const groups = new Map<string, { styleCode: string; color: string; title: string; thumb: string; upcs: string[] }>();
  for (const p of products) {
    const a = (p.attrs ?? {}) as Record<string, string>;
    const style = a['variant-group-code'] || a['vpn'] || p.sku || p.gtin;
    const k = `${style}|${p.color ?? ''}`;
    if (!groups.has(k)) groups.set(k, { styleCode: style, color: p.color ?? '', title: p.title, thumb: p.images[0]?.storedUrl || p.images[0]?.sourceUrl || '', upcs: [] });
    groups.get(k)!.upcs.push(normUpc(p.gtin));
  }

  // everything we know per marketplace, keyed by UPC
  const subs = new Map<string, { status: string; sentAt: Date; completedAt: Date | null }>(
    (await db.submission.findMany({ select: { id: true, status: true, sentAt: true, completedAt: true } })).map((s: { id: string; status: string; sentAt: Date; completedAt: Date | null }): [string, { status: string; sentAt: Date; completedAt: Date | null }] => [s.id, s]),
  );
  const changes = await db.pendingChange.findMany({ select: { channelId: true, approval: true, sendStatus: true, sendError: true, submissionId: true, detectedAt: true, decidedAt: true, product: { select: { gtin: true } } } });
  const ignored = await db.ignoredItem.findMany({ select: { channelKey: true, gtin: true, createdAt: true } });
  const catalog = await db.channelProduct.findMany({ select: { channelKey: true, upc: true, importedAt: true } });

  const per: Record<string, { change: Map<string, { stage: Stage; since: Date | null; error: string | null }>; ignored: Set<string>; catalog: Set<string>; offers: Map<string, number> }> = {};
  for (const c of channels) per[c.key] = { change: new Map(), ignored: new Set(), catalog: new Set(), offers: new Map() };
  const keyById = new Map(channels.map((c) => [c.id, c.key]));

  for (const ch of changes) {
    const key = keyById.get(ch.channelId); if (!key) continue;
    const upc = normUpc(ch.product.gtin);
    const sub = ch.submissionId ? subs.get(ch.submissionId) : undefined;
    let stage: Stage = 'queue', since: Date | null = ch.detectedAt, error: string | null = null;
    if (ch.sendStatus === 'rejected') { stage = 'rejected'; since = sub?.completedAt ?? ch.decidedAt; error = ch.sendError; }
    else if (ch.sendStatus === 'accepted' || sub?.status === 'complete') { stage = 'accepted'; since = sub?.completedAt ?? ch.decidedAt; }
    else if (ch.submissionId) { stage = 'sent'; since = sub?.sentAt ?? ch.decidedAt; }
    else if (ch.approval === 'approved') { stage = 'approved'; since = ch.decidedAt; }
    else if (ch.approval === 'rejected') { stage = 'ignored'; since = ch.decidedAt; }
    const prev = per[key].change.get(upc);
    if (!prev || RANK[stage] >= RANK[prev.stage]) per[key].change.set(upc, { stage, since, error });
  }
  for (const i of ignored) per[i.channelKey]?.ignored.add(normUpc(i.gtin));
  for (const c of catalog) per[c.channelKey]?.catalog.add(normUpc(c.upc));
  for (const c of channels) for (const it of (await getSnap(c.key)).items) if (it.upc) per[c.key].offers.set(it.upc, Math.max(per[c.key].offers.get(it.upc) ?? 0, it.qty));
  const hasOffers = Object.fromEntries(await Promise.all(channels.map(async (c) => [c.key, !!(await getSnap(c.key)).pulledAt] as const)));

  const now = Date.now();
  const rows: Row[] = [];
  for (const [key, g] of groups) {
    const cells: Record<string, Cell> = {};
    for (const c of channels) {
      const d = per[c.key];
      const counts: Partial<Record<Stage, number>> = {};
      let since: Date | null = null, error: string | null = null;
      for (const u of g.upcs) {
        let st: Stage;
        const ch = d.change.get(u);
        if (d.offers.has(u)) st = (d.offers.get(u) ?? 0) > 0 ? 'live' : 'oos';
        else if (d.catalog.has(u)) st = hasOffers[c.key] ? 'listed' : 'live';
        else if (ch) { st = ch.stage; if (ch.error) error = ch.error; if (ch.since && (!since || ch.since < since)) since = ch.since; }
        else if (d.ignored.has(u)) st = 'ignored';
        else st = 'not_started';
        counts[st] = (counts[st] ?? 0) + 1;
      }
      // the stage most sizes are in (ties go to the further step)
      const stage = (Object.entries(counts) as [Stage, number][]).sort((a, b) => b[1] - a[1] || RANK[b[0]] - RANK[a[0]])[0][0];
      const days = since ? (now - new Date(since).getTime()) / 86_400_000 : 0;
      const limit = STUCK_DAYS[stage];
      cells[c.key] = { stage, counts, since: since ? new Date(since).toISOString() : null, stuck: (!!limit && days > limit) || (!!counts.rejected && stage !== 'live'), error };
    }
    rows.push({ key, styleCode: g.styleCode, color: g.color, title: g.title, thumb: g.thumb, sizes: g.upcs.length, cells });
  }
  rows.sort((a, b) => a.title.localeCompare(b.title) || a.color.localeCompare(b.color));

  const summary = Object.fromEntries(channels.map((c) => {
    const s: Partial<Record<Stage, number>> = {};
    for (const r of rows) { const st = r.cells[c.key].stage; s[st] = (s[st] ?? 0) + 1; }
    return [c.key, { name: nameOf(c.key), counts: s, stuck: rows.filter((r) => r.cells[c.key].stuck).length, offersPulled: hasOffers[c.key] }];
  }));
  return { channels: channels.map((c) => c.key), summary, rows };
}
