import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readyToSend } from '@/lib/dispatch';
import { getPullCfg } from '@/lib/nordstrom-pull';
import { beats } from '@/lib/log';
import { short } from '@/lib/errors';

const names: Record<string, string> = { macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus' };

export async function GET() {
  try {
    const conns = await db.channelConnection.findMany({ where: { enabled: true, lastTestOk: true } });
    const keys = conns.map((c) => c.channelKey).filter((k) => k !== 'nordstrom');
    const [chans, pending, blocked, images, processing, recent, logs, products, pull] = await Promise.all([
      db.channel.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } }),
      db.pendingChange.groupBy({ by: ['channelId'], where: { approval: 'pending' }, _count: { _all: true } }),
      db.pendingChange.groupBy({ by: ['channelId'], where: { approval: 'pending', validation: 'blocked' }, _count: { _all: true } }),
      db.imageChange.groupBy({ by: ['channelKey'], where: { status: 'pending' }, _count: { _all: true } }),
      db.submission.count({ where: { status: 'processing' } }),
      db.submission.findMany({ orderBy: { sentAt: 'desc' }, take: 6, select: { id: true, channelKey: true, kind: true, status: true, rowCount: true, accepted: true, rejected: true, sentAt: true } }),
      db.activityLog.findMany({ orderBy: { at: 'desc' }, take: 7, select: { id: true, at: true, kind: true, level: true, message: true, actor: true } }),
      db.product.count(),
      getPullCfg(),
    ]);
    const idOf = new Map(chans.map((c) => [c.key, c.id]));
    const marketplaces = [];
    for (const key of keys) {
      const id = idOf.get(key);
      const r = await readyToSend(key);
      marketplaces.push({
        key, name: names[key] ?? key,
        pending: pending.find((p) => p.channelId === id)?._count._all ?? 0,
        blocked: blocked.find((p) => p.channelId === id)?._count._all ?? 0,
        images: images.find((i) => i.channelKey === key)?._count._all ?? 0,
        ready: r.sizes + r.images + ((r as { edits?: number }).edits ?? 0),
      });
    }
    return NextResponse.json({
      marketplaces, processing, recent, logs, products,
      pull: { enabled: !!pull.enabled, intervalMin: pull.intervalMin ?? 15, lastRunAt: pull.lastRunAt ?? null, lastResult: pull.lastResult ?? null, lastOk: pull.lastOk ?? null },
      beats: beats(), now: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ error: short(e) }, { status: 503 });
  }
}
