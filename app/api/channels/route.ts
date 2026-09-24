import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cached } from '@/lib/cache';
import { getGroups } from '@/lib/groups-cache';
import { short } from '@/lib/errors';

const names: Record<string, string> = {
  nordstrom: 'Nordstrom', macys: "Macy's", kohls: "Kohl's", jcpenney: 'JCPenney', debenhams: 'Debenhams', targetplus: 'Target Plus',
};

export async function GET() {
  try {
    const data = await cached('channels', 60_000, async () => {
      const [conns, chans, counts] = await Promise.all([
        db.channelConnection.findMany({ where: { enabled: true, lastTestOk: true } }),
        db.channel.findMany({ select: { id: true, key: true } }),
        db.pendingChange.groupBy({ by: ['channelId', 'validation'], where: { approval: 'pending' }, _count: { _all: true } }),
      ]);
      const channels = conns.filter((c) => c.channelKey !== 'nordstrom').map((c) => {
        const ch = chans.find((x) => x.key === c.channelKey);
        const mine = counts.filter((k) => k.channelId === ch?.id);
        return {
          key: c.channelKey,
          name: names[c.channelKey] ?? c.channelKey,
          pending: mine.reduce((n, k) => n + k._count._all, 0),
          blocked: mine.filter((k) => k.validation === 'blocked').reduce((n, k) => n + k._count._all, 0),
        };
      });
      return { channels, sourceConnected: conns.some((c) => c.channelKey === 'nordstrom') };
    });
    // Build each marketplace's queue in the background so opening it is instant.
    for (const c of data.channels) void getGroups(c.key).catch(() => {});
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ channels: [], sourceConnected: false, error: `Database: ${short(e)}` }, { status: 503 });
  }
}
